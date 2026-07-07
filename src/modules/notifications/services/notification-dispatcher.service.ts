import { Injectable } from '@nestjs/common';

import { FcmService } from '@/modules/notifications/services/fcm.service';
import { type GameId, NOTIFICATION_TYPES, NOTIFICATION_ROUTES } from '@/common/constants';
import { DeviceTokenService } from '@/modules/notifications/services/device-token.service';

@Injectable()
export class NotificationDispatcherService {
  constructor(
    private readonly fcmService: FcmService,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

  async sendTop100Entered(gameId: GameId, guestId: string, rank: number): Promise<void> {
    await this.sendToGuest(gameId, guestId, {
      params: { rank },
      route: NOTIFICATION_ROUTES.LEADERBOARD,
      type: NOTIFICATION_TYPES.TOP_100_ENTERED,
    });
  }

  async sendTop100Exited(gameId: GameId, guestId: string, rank: number): Promise<void> {
    await this.sendToGuest(gameId, guestId, {
      params: { rank },
      route: NOTIFICATION_ROUTES.LEADERBOARD,
      type: NOTIFICATION_TYPES.TOP_100_EXITED,
    });
  }

  async sendSaturdayRank(
    gameId: GameId,
    guestId: string,
    rank: number,
    locale?: string | null,
  ): Promise<void> {
    await this.sendToGuest(
      gameId,
      guestId,
      {
        locale,
        params: { rank },
        type: NOTIFICATION_TYPES.SATURDAY_RANK,
        route: NOTIFICATION_ROUTES.LEADERBOARD,
      },
      locale,
    );
  }

  private async sendToGuest(
    gameId: GameId,
    guestId: string,
    payload: {
      route: string;
      locale?: string | null;
      params?: Record<string, string | number>;
      type: (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
    },
    localeOverride?: string | null,
  ): Promise<void> {
    const device = await this.deviceTokenService.getActiveToken(gameId, guestId);
    if (!device) {
      return;
    }

    const result = await this.fcmService.sendToToken(device.token, {
      type: payload.type,
      route: payload.route,
      params: payload.params,
      locale: localeOverride ?? this.deviceTokenService.localeToCode(device.locale),
    });

    if (result.invalidToken) {
      await this.deviceTokenService.markTokenInvalid(device.token);
    }
  }
}
