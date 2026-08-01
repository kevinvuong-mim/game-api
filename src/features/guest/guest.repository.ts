import { Injectable } from '@nestjs/common';
import { Prisma, type DevicePlatform, NotificationLocale } from '@prisma/client';

import { GameId } from '@/common/constants';
import { PrismaService } from '@/infra/prisma/prisma.service';

export interface RegisterFcmInput {
  token: string;
  gameId: GameId;
  guestId: string;
  platform: DevicePlatform;
  locale: NotificationLocale;
}

export class FcmTokenConflictError extends Error {
  constructor() {
    super('FCM token is already registered to another guest');
    this.name = 'FcmTokenConflictError';
  }
}

const CLEAR_FCM_FIELDS = {
  fcmToken: null,
  devicePlatform: null,
  notificationLocale: null,
} as const;

@Injectable()
export class GuestRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByAuthTokenHash(authTokenHash: string) {
    return this.prisma.guestPlayer.findUnique({
      where: { authTokenHash },
    });
  }

  create(gameId: GameId, authTokenHash: string) {
    return this.prisma.guestPlayer.create({
      data: {
        gameId,
        authTokenHash,
      },
    });
  }

  updateName(gameId: GameId, id: string, name: string) {
    return this.prisma.guestPlayer.update({
      data: { name },
      where: { gameId_id: { gameId, id } },
    });
  }

  async findNamesByIds(guestIds: string[]): Promise<Map<string, string | null>> {
    if (guestIds.length === 0) {
      return new Map();
    }

    const guests = await this.prisma.guestPlayer.findMany({
      where: { id: { in: guestIds } },
      select: { id: true, name: true },
    });

    return new Map(guests.map((guest) => [guest.id, guest.name]));
  }

  async registerFcmToken(input: RegisterFcmInput) {
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

  async updateFcmToken(gameId: GameId, guestId: string, token: string, locale: NotificationLocale) {
    const existing = await this.prisma.guestPlayer.findUnique({
      where: { gameId_id: { gameId, id: guestId } },
      select: { id: true, fcmToken: true, devicePlatform: true },
    });

    if (!existing?.fcmToken) {
      return null;
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

  unregisterFcmToken(gameId: GameId, guestId: string) {
    return this.prisma.guestPlayer.updateMany({
      where: {
        gameId,
        id: guestId,
        fcmToken: { not: null },
      },
      data: { ...CLEAR_FCM_FIELDS },
    });
  }

  findActiveFcmToken(gameId: GameId, guestId: string) {
    return this.prisma.guestPlayer.findFirst({
      where: {
        gameId,
        id: guestId,
        fcmToken: { not: null },
      },
      select: { gameId: true, id: true, fcmToken: true, notificationLocale: true },
    });
  }

  markFcmTokenInvalid(fcmToken: string) {
    return this.prisma.guestPlayer.updateMany({
      where: { fcmToken },
      data: { ...CLEAR_FCM_FIELDS },
    });
  }

  findActiveFcmTokenBatch(gameId: GameId, cursor?: string, take = 500) {
    return this.prisma.guestPlayer.findMany({
      take,
      orderBy: { id: 'asc' },
      where: { gameId, fcmToken: { not: null } },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, gameId: true, fcmToken: true, notificationLocale: true },
    });
  }

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
        data: { ...CLEAR_FCM_FIELDS },
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
      throw new FcmTokenConflictError();
    }
  }
}
