import { Logger, Injectable } from '@nestjs/common';

import {
  type GameId,
  NOTIFICATION_ROUTES,
  NOTIFICATION_TYPES,
  toNotificationLocaleCode,
} from '@/common/constants';
import { FcmService } from '@/features/notifications/fcm.service';
import { DeviceTokenService } from '@/features/notifications/device-token.service';

export interface DeliverNotificationInput {
  route: string;
  gameId: GameId;
  guestId: string;
  locale?: string | null;
  params?: Record<string, string | number>;
  type: (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
}

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly fcmService: FcmService,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

  async sendTop100Exited(gameId: GameId, guestId: string, rank: number): Promise<boolean> {
    return this.deliver({
      gameId,
      guestId,
      params: { rank },
      route: NOTIFICATION_ROUTES.LEADERBOARD,
      type: NOTIFICATION_TYPES.TOP_100_EXITED,
    });
  }

  async sendRankPush(
    gameId: GameId,
    guestId: string,
    rank: number,
    locale?: string | null,
  ): Promise<boolean> {
    return this.deliver({
      locale,
      gameId,
      guestId,
      params: { rank },
      type: NOTIFICATION_TYPES.RANK_PUSH,
      route: NOTIFICATION_ROUTES.LEADERBOARD,
    });
  }

  async deliver(input: DeliverNotificationInput): Promise<boolean> {
    try {
      if (!this.fcmService.isEnabled()) {
        return false;
      }

      const device = await this.deviceTokenService.getActiveToken(input.gameId, input.guestId);
      if (!device?.fcmToken) {
        return false;
      }

      const localeCode =
        input.locale != null && input.locale !== ''
          ? toNotificationLocaleCode(input.locale)
          : toNotificationLocaleCode(device.notificationLocale?.toString() ?? 'EN');

      const result = await this.fcmService.sendToToken(device.fcmToken, {
        type: input.type,
        locale: localeCode,
        route: input.route,
        params: input.params,
      });

      if (result.invalidToken) {
        await this.deviceTokenService.markTokenInvalid(device.fcmToken);
      }

      return result.success;
    } catch (error) {
      this.logger.error('Unexpected FCM delivery error', error);
      return false;
    }
  }
}
