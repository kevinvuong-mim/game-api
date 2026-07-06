import { Cron } from '@nestjs/schedule';
import { Logger, Injectable } from '@nestjs/common';

import { NOTIFICATION_CRON } from '@/common/constants';
import { SaturdayRankCronService } from '@/modules/notifications/jobs/saturday-rank.job';

@Injectable()
export class SaturdayRankScheduler {
  private readonly logger = new Logger(SaturdayRankScheduler.name);

  constructor(private readonly saturdayRankCronService: SaturdayRankCronService) {}

  @Cron(NOTIFICATION_CRON.SATURDAY_RANK, {
    name: 'saturday-rank-notification',
    timeZone: NOTIFICATION_CRON.TIMEZONE,
  })
  async handleSaturdayRankBroadcast(): Promise<void> {
    this.logger.log('Starting Saturday rank notification broadcast');
    await this.saturdayRankCronService.enqueueSaturdayBroadcast();
  }
}
