import { Injectable } from '@nestjs/common';
import { Prisma, NotificationLocale, NotificationOutboxStatus } from '@prisma/client';

import type { GameId } from '@/common/constants';
import { PrismaService } from '@/modules/prisma/prisma.service';

export interface CreateOutboxInput {
  type: string;
  route: string;
  gameId: GameId;
  guestId: string;
  idempotencyKey?: string | null;
  locale?: NotificationLocale | null;
  params?: Record<string, string | number>;
}

@Injectable()
export class NotificationOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrGet(input: CreateOutboxInput) {
    if (input.idempotencyKey) {
      const existing = await this.prisma.notificationOutbox.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });

      if (existing) {
        return existing;
      }
    }

    try {
      return await this.prisma.notificationOutbox.create({
        data: {
          type: input.type,
          route: input.route,
          gameId: input.gameId,
          params: input.params,
          guestId: input.guestId,
          locale: input.locale ?? undefined,
          idempotencyKey: input.idempotencyKey ?? undefined,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        input.idempotencyKey
      ) {
        const existing = await this.prisma.notificationOutbox.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  }

  async findById(id: string) {
    return this.prisma.notificationOutbox.findUnique({ where: { id } });
  }

  async resetStaleProcessing(staleBefore: Date): Promise<number> {
    const result = await this.prisma.notificationOutbox.updateMany({
      where: {
        updatedAt: { lt: staleBefore },
        status: NotificationOutboxStatus.PROCESSING,
      },
      data: {
        lastError: 'processing_stale_reset',
        status: NotificationOutboxStatus.PENDING,
      },
    });

    return result.count;
  }

  async claimForProcessing(id: string) {
    const result = await this.prisma.notificationOutbox.updateMany({
      where: {
        id,
        scheduledAt: { lte: new Date() },
        status: NotificationOutboxStatus.PENDING,
      },
      data: {
        status: NotificationOutboxStatus.PROCESSING,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(id);
  }

  async markSent(id: string) {
    return this.prisma.notificationOutbox.update({
      where: { id },
      data: {
        lastError: null,
        sentAt: new Date(),
        status: NotificationOutboxStatus.SENT,
      },
    });
  }

  async markSkipped(id: string, reason: string) {
    return this.prisma.notificationOutbox.update({
      where: { id },
      data: {
        lastError: reason,
        status: NotificationOutboxStatus.SKIPPED,
      },
    });
  }

  async markDead(id: string, reason: string) {
    return this.prisma.notificationOutbox.update({
      where: { id },
      data: {
        lastError: reason,
        status: NotificationOutboxStatus.DEAD,
      },
    });
  }

  async markPendingForRetry(id: string, reason: string, attempts: number, scheduledAt: Date) {
    return this.prisma.notificationOutbox.update({
      where: { id },
      data: {
        attempts,
        scheduledAt,
        lastError: reason,
        status: NotificationOutboxStatus.PENDING,
      },
    });
  }

  async findRetryableBatch(take: number) {
    const rows = await this.prisma.notificationOutbox.findMany({
      take: take * 2,
      orderBy: { scheduledAt: 'asc' },
      where: {
        scheduledAt: { lte: new Date() },
        status: NotificationOutboxStatus.PENDING,
      },
    });

    return rows.filter((row) => row.attempts < row.maxAttempts).slice(0, take);
  }
}
