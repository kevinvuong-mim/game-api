import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { NotificationLocale } from '@prisma/client';

import {
  type GameId,
  NOTIFICATION_JOB,
  NOTIFICATION_QUEUE,
  type NotificationType,
  FCM_DELIVERY_BACKOFF_MS,
  FCM_PROCESSING_STALE_MS,
} from '@/common/constants';
import { FcmService } from '@/modules/notifications/services/fcm.service';
import {
  type CreateOutboxInput,
  NotificationOutboxRepository,
} from '@/modules/notifications/repositories/notification-outbox.repository';
import { DeviceTokenService } from '@/modules/notifications/services/device-token.service';

export interface EnqueueNotificationInput {
  route: string;
  gameId: GameId;
  guestId: string;
  locale?: string | null;
  idempotencyKey?: string | null;
  type: CreateOutboxInput['type'];
  params?: Record<string, string | number>;
}

@Injectable()
export class NotificationOutboxService {
  private readonly logger = new Logger(NotificationOutboxService.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE.FCM_DELIVERY)
    private readonly fcmDeliveryQueue: Queue,
    private readonly fcmService: FcmService,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly outboxRepository: NotificationOutboxRepository,
  ) {}

  async enqueue(input: EnqueueNotificationInput): Promise<string | null> {
    const device = await this.deviceTokenService.getActiveToken(input.gameId, input.guestId);
    if (!device) {
      return null;
    }

    const row = await this.outboxRepository.createOrGet({
      type: input.type,
      route: input.route,
      gameId: input.gameId,
      params: input.params,
      guestId: input.guestId,
      idempotencyKey: input.idempotencyKey,
      locale: this.resolveLocale(input.locale, device.locale),
    });

    if (row.status === 'SENT' || row.status === 'SKIPPED' || row.status === 'DEAD') {
      return row.id;
    }

    if (row.status === 'PROCESSING') {
      return row.id;
    }

    await this.enqueueDeliveryJob(row.id);
    return row.id;
  }

  async deliver(outboxId: string): Promise<void> {
    const row = await this.outboxRepository.findById(outboxId);
    if (!row || row.status === 'SENT' || row.status === 'SKIPPED' || row.status === 'DEAD') {
      return;
    }

    const claimed = await this.outboxRepository.claimForProcessing(outboxId);
    if (!claimed) {
      return;
    }

    try {
      if (!this.fcmService.isEnabled()) {
        await this.scheduleRetry(claimed, 'fcm_disabled');
        return;
      }

      const device = await this.deviceTokenService.getActiveToken(
        claimed.gameId as GameId,
        claimed.guestId,
      );
      if (!device) {
        await this.outboxRepository.markSkipped(outboxId, 'no_active_token');
        return;
      }

      const localeCode = this.deviceTokenService.localeToCode(claimed.locale ?? device.locale);

      const result = await this.fcmService.sendToToken(device.token, {
        type: claimed.type as NotificationType,
        route: claimed.route,
        params: (claimed.params as Record<string, string | number> | null) ?? undefined,
        locale: localeCode,
      });

      if (result.success) {
        await this.outboxRepository.markSent(outboxId);
        return;
      }

      if (result.invalidToken) {
        await this.deviceTokenService.markTokenInvalid(device.token);
        await this.outboxRepository.markSkipped(outboxId, 'invalid_token');
        return;
      }

      const nextAttempts = claimed.attempts + 1;
      if (nextAttempts >= claimed.maxAttempts) {
        await this.outboxRepository.markDead(outboxId, 'max_attempts_exceeded');
        return;
      }

      await this.scheduleRetry(claimed, 'fcm_transient_error', nextAttempts);
    } catch (error) {
      this.logger.error(`Unexpected FCM delivery error for ${outboxId}`, error);

      const nextAttempts = claimed.attempts + 1;
      if (nextAttempts >= claimed.maxAttempts) {
        await this.outboxRepository.markDead(outboxId, 'unexpected_error');
        return;
      }

      await this.scheduleRetry(claimed, 'unexpected_error', nextAttempts);
    }
  }

  async recoverStaleProcessing(): Promise<number> {
    const staleBefore = new Date(Date.now() - FCM_PROCESSING_STALE_MS);
    const count = await this.outboxRepository.resetStaleProcessing(staleBefore);

    if (count > 0) {
      this.logger.warn(`Recovered ${count} stale FCM outbox rows from PROCESSING`);
    }

    return count;
  }

  async enqueueRetryableBatch(limit: number): Promise<number> {
    await this.recoverStaleProcessing();

    const rows = await this.outboxRepository.findRetryableBatch(limit);
    for (const row of rows) {
      await this.enqueueDeliveryJob(row.id, `${row.id}:retry:${Date.now()}`);
    }

    if (rows.length > 0) {
      this.logger.log(`Re-enqueued ${rows.length} pending FCM deliveries`);
    }

    return rows.length;
  }

  buildSaturdayRankIdempotencyKey(gameId: GameId, guestId: string, now = new Date()): string {
    const week = this.getIsoWeekKey(now);
    return `${gameId}:${guestId}:saturday_rank:${week}`;
  }

  buildTop100IdempotencyKey(gameId: GameId, guestId: string, type: string, rank: number): string {
    return `${gameId}:${guestId}:${type}:${rank}`;
  }

  private async enqueueDeliveryJob(outboxId: string, jobId = outboxId): Promise<void> {
    await this.fcmDeliveryQueue.add(
      NOTIFICATION_JOB.DELIVER_FCM,
      { outboxId },
      {
        jobId,
        attempts: 1,
        removeOnFail: true,
        removeOnComplete: true,
      },
    );
  }

  private async scheduleRetry(
    row: { id: string; attempts: number; maxAttempts: number },
    reason: string,
    attempts = row.attempts + 1,
  ): Promise<void> {
    const backoffMs =
      FCM_DELIVERY_BACKOFF_MS[Math.min(attempts - 1, FCM_DELIVERY_BACKOFF_MS.length - 1)];

    await this.outboxRepository.markPendingForRetry(
      row.id,
      reason,
      attempts,
      new Date(Date.now() + backoffMs),
    );
  }

  private resolveLocale(
    locale: string | null | undefined,
    deviceLocale: NotificationLocale,
  ): NotificationLocale {
    if (locale?.toLowerCase().startsWith('vi')) {
      return NotificationLocale.VI;
    }
    if (locale?.toLowerCase().startsWith('en')) {
      return NotificationLocale.EN;
    }
    return deviceLocale;
  }

  private getIsoWeekKey(date: Date): string {
    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
}
