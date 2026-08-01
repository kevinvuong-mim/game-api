import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type DevicePlatform, NotificationLocale } from '@prisma/client';

import type { GameId } from '@/common/constants';
import { PrismaService } from '@/infra/prisma/prisma.service';

export interface RegisterDeviceInput {
  token: string;
  gameId: GameId;
  guestId: string;
  platform: DevicePlatform;
  locale: NotificationLocale;
}

@Injectable()
export class DeviceTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(input: RegisterDeviceInput) {
    try {
      return await this.transferFcmToken({
        token: input.token,
        gameId: input.gameId,
        guestId: input.guestId,
        platform: input.platform,
        locale: input.locale,
      });
    } catch (error) {
      this.rethrowUniqueConflict(error);
      throw error;
    }
  }

  async updateDeviceToken(
    gameId: GameId,
    guestId: string,
    token: string,
    locale: NotificationLocale,
  ) {
    const existing = await this.prisma.guestPlayer.findUnique({
      where: {
        gameId_id: {
          gameId,
          id: guestId,
        },
      },
      select: { id: true, gameId: true, fcmToken: true, devicePlatform: true },
    });

    if (!existing || !existing.fcmToken) {
      throw new NotFoundException('Device token not found');
    }

    try {
      return await this.transferFcmToken({
        token,
        gameId,
        guestId,
        locale,
        platform: existing.devicePlatform ?? undefined,
      });
    } catch (error) {
      this.rethrowUniqueConflict(error);
      throw error;
    }
  }

  async unregisterDevice(gameId: GameId, guestId: string) {
    return this.prisma.guestPlayer.updateMany({
      where: {
        gameId,
        id: guestId,
        fcmToken: { not: null },
      },
      data: {
        fcmToken: null,
        devicePlatform: null,
        notificationLocale: null,
      },
    });
  }

  async findActiveToken(gameId: GameId, guestId: string) {
    return this.prisma.guestPlayer.findFirst({
      where: {
        gameId,
        id: guestId,
        fcmToken: { not: null },
      },
      select: { gameId: true, id: true, fcmToken: true, notificationLocale: true },
    });
  }

  async markTokenInvalid(fcmToken: string) {
    return this.prisma.guestPlayer.updateMany({
      where: { fcmToken },
      data: {
        fcmToken: null,
        devicePlatform: null,
        notificationLocale: null,
      },
    });
  }

  async findActiveTokenBatch(gameId: GameId, cursor?: string, take = 500) {
    return this.prisma.guestPlayer.findMany({
      take,
      orderBy: { id: 'asc' },
      where: { gameId, fcmToken: { not: null } },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, gameId: true, fcmToken: true, notificationLocale: true },
    });
  }

  /**
   * Atomically clear the token from any other owner, then assign to the target guest.
   * Unique(fcmToken) races surface as ConflictException instead of a 500.
   */
  private async transferFcmToken(params: {
    token: string;
    gameId: GameId;
    guestId: string;
    locale: NotificationLocale;
    platform?: DevicePlatform;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.guestPlayer.updateMany({
        where: {
          fcmToken: params.token,
          NOT: {
            AND: [{ id: params.guestId }, { gameId: params.gameId }],
          },
        },
        data: {
          fcmToken: null,
          devicePlatform: null,
          notificationLocale: null,
        },
      });

      return tx.guestPlayer.update({
        where: {
          gameId_id: { gameId: params.gameId, id: params.guestId },
        },
        data: {
          fcmToken: params.token,
          notificationLocale: params.locale,
          ...(params.platform !== undefined ? { devicePlatform: params.platform } : {}),
        },
      });
    });
  }

  private rethrowUniqueConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('FCM token is already registered to another guest');
    }
  }
}
