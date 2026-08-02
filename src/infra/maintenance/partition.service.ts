import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { Logger, Injectable, OnModuleInit } from '@nestjs/common';

import { PARTITION_CRON } from '@/common/constants';
import { PrismaService } from '@/infra/prisma/prisma.service';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PartitionService implements OnModuleInit {
  private readonly logger = new Logger(PartitionService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.ensurePartitionsForUpcomingPeriod();
  }

  /** Runs at 23:59 on the 28th–31st; only acts on the last day of the month. */
  @Cron(PARTITION_CRON)
  async ensurePartitionsBeforeMonthBoundary() {
    const now = new Date();
    if (!this.isLastDayOfMonth(now)) {
      return;
    }

    this.logger.log('Pre-creating game_results partitions before month boundary');
    await this.ensurePartitionsForUpcomingPeriod(now);
  }

  async ensurePartitionsForUpcomingPeriod(referenceDate = new Date()): Promise<void> {
    const year = referenceDate.getFullYear();
    await this.ensurePartitionForYear(year);
    await this.ensurePartitionForYear(year + 1);
  }

  async ensurePartitionForInsertDate(date: Date, client: DbClient = this.prisma): Promise<void> {
    const year = date.getFullYear();
    await this.ensurePartitionForYear(year, client);
    await this.ensurePartitionForYear(year + 1, client);
  }

  async ensurePartitionForYear(year: number, client: DbClient = this.prisma): Promise<void> {
    const tableName = `game_results_${year}`;

    const exists = await client.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = ${tableName}
      ) AS exists
    `;

    if (exists[0]?.exists) {
      return;
    }

    const from = `${year}-01-01`;
    const to = `${year + 1}-01-01`;

    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${tableName}
      PARTITION OF game_results
      FOR VALUES FROM ('${from}') TO ('${to}')
    `);

    this.logger.log(`Created partition ${tableName}`);
  }

  private isLastDayOfMonth(date: Date): boolean {
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.getDate() === 1;
  }
}
