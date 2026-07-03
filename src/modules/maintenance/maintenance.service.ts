import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '@/modules/prisma/prisma.service';

@Injectable()
export class MaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.ensureNextYearPartition();
  }

  @Cron(process.env.PARTITION_CRON ?? '0 3 1 * *')
  async ensureNextYearPartition() {
    const nextYear = new Date().getFullYear() + 1;
    const tableName = `game_results_${nextYear}`;

    const exists = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = ${tableName}
      ) AS exists
    `;

    if (exists[0]?.exists) {
      this.logger.log(`Partition ${tableName} already exists`);
      return;
    }

    const from = `${nextYear}-01-01`;
    const to = `${nextYear + 1}-01-01`;

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE ${tableName}
      PARTITION OF game_results
      FOR VALUES FROM ('${from}') TO ('${to}')
    `);

    this.logger.log(`Created partition ${tableName}`);
  }
}
