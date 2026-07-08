import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';

import { NOTIFICATION_JOB, NOTIFICATION_QUEUE } from '@/common/constants';
import {
  type FcmDeliveryPayload,
  NotificationQueueService,
} from '@/features/notifications/notification-queue.service';

@Processor(NOTIFICATION_QUEUE.FCM_DELIVERY)
export class FcmDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(FcmDeliveryProcessor.name);

  constructor(private readonly notificationQueueService: NotificationQueueService) {
    super();
  }

  async process(job: Job<FcmDeliveryPayload>): Promise<void> {
    if (job.name !== NOTIFICATION_JOB.DELIVER_FCM) {
      return;
    }

    await this.notificationQueueService.deliver(job.data);
    this.logger.debug(
      `FCM delivery processed: game=${job.data.gameId} guest=${job.data.guestId} type=${job.data.type}`,
    );
  }
}
