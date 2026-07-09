import type { Prisma } from '@prisma/client';
import { Logger, Injectable } from '@nestjs/common';

import { PrismaService } from '@/infra/prisma/prisma.service';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class PartitionService {
  private readonly logger = new Logger(PartitionService.name);

  constructor(private readonly prisma: PrismaService) {}

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
}
