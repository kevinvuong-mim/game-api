import { Injectable, NotFoundException } from '@nestjs/common';
import { type DevicePlatform, DeviceTokenStatus, NotificationLocale } from '@prisma/client';

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
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const tokenOwner = await tx.guestDeviceToken.findUnique({
        where: { token: input.token },
      });

      if (tokenOwner && tokenOwner.guestId !== input.guestId) {
        await tx.guestDeviceToken.update({
          where: { id: tokenOwner.id },
          data: {
            token: `${tokenOwner.id}:revoked`,
            status: DeviceTokenStatus.INACTIVE,
          },
        });
      }

      return tx.guestDeviceToken.upsert({
        where: {
          gameId_guestId: {
            gameId: input.gameId,
            guestId: input.guestId,
          },
        },
        create: {
          lastSeenAt: now,
          token: input.token,
          gameId: input.gameId,
          locale: input.locale,
          guestId: input.guestId,
          platform: input.platform,
          status: DeviceTokenStatus.ACTIVE,
        },
        update: {
          lastSeenAt: now,
          token: input.token,
          locale: input.locale,
          platform: input.platform,
          status: DeviceTokenStatus.ACTIVE,
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
    const now = new Date();
    const existing = await this.prisma.guestDeviceToken.findUnique({
      where: {
        gameId_guestId: {
          gameId,
          guestId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Device token not found');
    }

    const tokenOwner = await this.prisma.guestDeviceToken.findUnique({
      where: { token },
    });

    if (tokenOwner && tokenOwner.id !== existing.id) {
      await this.prisma.guestDeviceToken.update({
        where: { id: tokenOwner.id },
        data: {
          token: `${tokenOwner.id}:revoked`,
          status: DeviceTokenStatus.INACTIVE,
        },
      });
    }

    return this.prisma.guestDeviceToken.update({
      where: { id: existing.id },
      data: {
        token,
        locale,
        status: DeviceTokenStatus.ACTIVE,
        lastSeenAt: now,
      },
    });
  }

  async unregisterDevice(gameId: GameId, guestId: string) {
    return this.prisma.guestDeviceToken.updateMany({
      where: {
        gameId,
        guestId,
        status: DeviceTokenStatus.ACTIVE,
      },
      data: {
        status: DeviceTokenStatus.INACTIVE,
      },
    });
  }

  async touchHeartbeat(gameId: GameId, guestId: string) {
    return this.prisma.guestDeviceToken.updateMany({
      where: {
        gameId,
        guestId,
        status: DeviceTokenStatus.ACTIVE,
      },
      data: {
        lastSeenAt: new Date(),
      },
    });
  }

  async findActiveToken(gameId: GameId, guestId: string) {
    return this.prisma.guestDeviceToken.findFirst({
      where: {
        gameId,
        guestId,
        status: DeviceTokenStatus.ACTIVE,
      },
    });
  }

  async markTokenInvalid(token: string) {
    return this.prisma.guestDeviceToken.updateMany({
      where: { token },
      data: { status: DeviceTokenStatus.INVALID },
    });
  }

  async findActiveTokenBatch(cursor?: string, take = 500) {
    return this.prisma.guestDeviceToken.findMany({
      where: {
        status: DeviceTokenStatus.ACTIVE,
      },
      orderBy: { id: 'asc' },
      take,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
    });
  }
}
