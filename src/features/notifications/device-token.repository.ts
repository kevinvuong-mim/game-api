import { Injectable, NotFoundException } from '@nestjs/common';
import { type DevicePlatform, NotificationLocale } from '@prisma/client';

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
    return this.prisma.$transaction(async (tx) => {
      const tokenOwner = await tx.guestPlayer.findFirst({
        where: { fcmToken: input.token },
        select: { id: true, gameId: true },
      });

      if (tokenOwner && (tokenOwner.id !== input.guestId || tokenOwner.gameId !== input.gameId)) {
        await tx.guestPlayer.update({
          where: { id: tokenOwner.id },
          data: {
            fcmToken: null,
            devicePlatform: null,
            notificationLocale: null,
          },
        });
      }

      return tx.guestPlayer.update({
        where: {
          gameId_id: { gameId: input.gameId, id: input.guestId },
        },
        data: {
          fcmToken: input.token,
          notificationLocale: input.locale,
          devicePlatform: input.platform,
        },
      });
    });
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
      select: { id: true, gameId: true, fcmToken: true },
    });

    if (!existing || !existing.fcmToken) {
      throw new NotFoundException('Device token not found');
    }

    const tokenOwner = await this.prisma.guestPlayer.findFirst({
      where: { fcmToken: token },
      select: { id: true, gameId: true },
    });

    if (tokenOwner && (tokenOwner.id !== existing.id || tokenOwner.gameId !== existing.gameId)) {
      await this.prisma.guestPlayer.update({
        where: { id: tokenOwner.id },
        data: {
          fcmToken: null,
          devicePlatform: null,
          notificationLocale: null,
        },
      });
    }

    return this.prisma.guestPlayer.update({
      where: { id: existing.id },
      data: {
        fcmToken: token,
        notificationLocale: locale,
      },
    });
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

  async findActiveTokenBatch(cursor?: string, take = 500) {
    return this.prisma.guestPlayer.findMany({
      where: {
        fcmToken: { not: null },
      },
      orderBy: { id: 'asc' },
      take,
      select: { id: true, gameId: true, fcmToken: true, notificationLocale: true },
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
    });
  }
}
