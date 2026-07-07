import { Cron } from '@nestjs/schedule';
import { Logger, Injectable } from '@nestjs/common';

import { FCM_RETRY_BATCH_SIZE, NOTIFICATION_CRON } from '@/common/constants';
import { NotificationOutboxService } from '@/features/notifications/notification-outbox.service';

@Injectable()
export class FcmRetryScheduler {
  private readonly logger = new Logger(FcmRetryScheduler.name);

  constructor(private readonly outboxService: NotificationOutboxService) {}

  @Cron(NOTIFICATION_CRON.FCM_RETRY, {
    name: 'fcm-delivery-retry',
    timeZone: NOTIFICATION_CRON.TIMEZONE,
  })
  async handleRetryPendingDeliveries(): Promise<void> {
    const count = await this.outboxService.enqueueRetryableBatch(FCM_RETRY_BATCH_SIZE);
    if (count > 0) {
      this.logger.log(`FCM retry scheduler re-enqueued ${count} deliveries`);
    }
  }
}
