import { Logger, Injectable } from '@nestjs/common';

import { FcmService } from '@/features/notifications/fcm.service';
import { type GameId, type NotificationType } from '@/common/constants';
import { DeviceTokenService } from '@/features/notifications/device-token.service';

export interface DeliverNotificationInput {
  route: string;
  gameId: GameId;
  guestId: string;
  locale?: string | null;
  type: NotificationType;
  params?: Record<string, string | number>;
}

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly fcmService: FcmService,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

  async deliver(input: DeliverNotificationInput): Promise<boolean> {
    try {
      if (!this.fcmService.isEnabled()) {
        return false;
      }

      const device = await this.deviceTokenService.getActiveToken(input.gameId, input.guestId);
      if (!device?.fcmToken) {
        return false;
      }

      const localeCode = this.deviceTokenService.localeToCode(
        input.locale ?? device.notificationLocale ?? 'EN',
      );
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
