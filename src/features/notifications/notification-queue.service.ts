import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { NotificationLocale } from '@prisma/client';

import {
  type GameId,
  NOTIFICATION_JOB,
  NOTIFICATION_QUEUE,
  type NotificationType,
} from '@/common/constants';
import { FcmService } from '@/features/notifications/fcm.service';
import { DeviceTokenService } from '@/features/notifications/device-token.service';

export interface EnqueueNotificationInput {
  jobId?: string;
  route: string;
  gameId: GameId;
  guestId: string;
  locale?: string | null;
  type: NotificationType;
  params?: Record<string, string | number>;
}

export interface FcmDeliveryPayload {
  route: string;
  gameId: GameId;
  guestId: string;
  locale?: string | null;
  type: NotificationType;
  params?: Record<string, string | number>;
}

@Injectable()
export class NotificationQueueService {
  private readonly logger = new Logger(NotificationQueueService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE.FCM_DELIVERY)
    private readonly fcmDeliveryQueue: Queue,
    private readonly fcmService: FcmService,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

  async enqueue(input: EnqueueNotificationInput): Promise<boolean> {
    const muted = await this.deviceTokenService.isNotificationMuted(input.gameId, input.guestId);
    if (muted) {
      return false;
    }

    const device = await this.deviceTokenService.getActiveToken(input.gameId, input.guestId);
    if (!device) {
      return false;
    }

    await this.enqueueDeliveryJob(
      {
        route: input.route,
        gameId: input.gameId,
        guestId: input.guestId,
        params: input.params,
        locale: this.resolveLocale(input.locale, device.notificationLocale),
        type: input.type,
      },
      input.jobId,
    );
    return true;
  }

  async deliver(payload: FcmDeliveryPayload): Promise<void> {
    try {
      const muted = await this.deviceTokenService.isNotificationMuted(
        payload.gameId,
        payload.guestId,
      );
      if (muted || !this.fcmService.isEnabled()) {
        return;
      }

      const device = await this.deviceTokenService.getActiveToken(payload.gameId, payload.guestId);
      if (!device?.fcmToken) {
        return;
      }

      const localeCode = this.deviceTokenService.localeToCode(
        payload.locale ?? device.notificationLocale ?? 'EN',
      );
      const result = await this.fcmService.sendToToken(device.fcmToken, {
        type: payload.type,
        route: payload.route,
        params: payload.params,
        locale: localeCode,
      });

      if (result.invalidToken) {
        await this.deviceTokenService.markTokenInvalid(device.fcmToken);
      }
    } catch (error) {
      this.logger.error('Unexpected FCM delivery error', error);
    }
  }

  private async enqueueDeliveryJob(payload: FcmDeliveryPayload, jobId?: string): Promise<void> {
    await this.fcmDeliveryQueue.add(NOTIFICATION_JOB.DELIVER_FCM, payload, {
      attempts: 1,
      ...(jobId ? { jobId } : {}),
      removeOnFail: true,
      removeOnComplete: true,
    });
  }

  private resolveLocale(
    locale: string | null | undefined,
    deviceLocale?: NotificationLocale | null,
  ): NotificationLocale {
    if (locale?.toLowerCase().startsWith('vi')) {
      return NotificationLocale.VI;
    }
    if (locale?.toLowerCase().startsWith('en')) {
      return NotificationLocale.EN;
    }
    return deviceLocale ?? NotificationLocale.EN;
  }
}
