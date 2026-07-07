import { Cron } from '@nestjs/schedule';
import { Logger, Injectable, OnModuleInit } from '@nestjs/common';

import { PARTITION_CRON } from '@/common/constants';
import { PrismaService } from '@/infra/prisma/prisma.service';

@Injectable()
export class MaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.ensurePartitions();
  }

  @Cron(PARTITION_CRON)
  async ensurePartitions() {
    const currentYear = new Date().getFullYear();
    await this.ensurePartitionForYear(currentYear);
    await this.ensurePartitionForYear(currentYear + 1);
  }

  private async ensurePartitionForYear(year: number) {
    const tableName = `game_results_${year}`;

    const exists = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = ${tableName}
      ) AS exists
    `;

    if (exists[0]?.exists) {
      this.logger.log(`Partition ${tableName} already exists`);
      return;
    }

    const from = `${year}-01-01`;
    const to = `${year + 1}-01-01`;

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE ${tableName}
      PARTITION OF game_results
      FOR VALUES FROM ('${from}') TO ('${to}')
    `);

    this.logger.log(`Created partition ${tableName}`);
  }
}
