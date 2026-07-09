import { Cron } from '@nestjs/schedule';
import { Logger, Injectable, OnModuleInit } from '@nestjs/common';

import { PARTITION_CRON } from '@/common/constants';
import { PartitionService } from '@/infra/maintenance/partition.service';

@Injectable()
export class MaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly partitionService: PartitionService) {}

  onModuleInit() {
    void this.partitionService.ensurePartitionsForUpcomingPeriod();
  }

  /** Runs at 23:59 on the 28th–31st; only acts on the last day of the month. */
  @Cron(PARTITION_CRON)
  async ensurePartitionsBeforeMonthBoundary() {
    const now = new Date();
    if (!this.isLastDayOfMonth(now)) {
      return;
    }

    this.logger.log('Pre-creating game_results partitions before month boundary');
    await this.partitionService.ensurePartitionsForUpcomingPeriod(now);
  }

  private isLastDayOfMonth(date: Date): boolean {
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.getDate() === 1;
  }
}
