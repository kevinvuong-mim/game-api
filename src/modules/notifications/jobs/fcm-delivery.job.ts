import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';

import { NOTIFICATION_JOB, NOTIFICATION_QUEUE } from '@/common/constants';
import { NotificationOutboxService } from '@/modules/notifications/services/notification-outbox.service';

interface FcmDeliveryPayload {
  outboxId: string;
}

@Processor(NOTIFICATION_QUEUE.FCM_DELIVERY)
export class FcmDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(FcmDeliveryProcessor.name);

  constructor(private readonly outboxService: NotificationOutboxService) {
    super();
  }

  async process(job: Job<FcmDeliveryPayload>): Promise<void> {
    if (job.name !== NOTIFICATION_JOB.DELIVER_FCM) {
      return;
    }

    await this.outboxService.deliver(job.data.outboxId);
    this.logger.debug(`FCM delivery processed: ${job.data.outboxId}`);
  }
}
