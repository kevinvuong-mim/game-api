import { Injectable } from '@nestjs/common';

import { type GameId, NOTIFICATION_TYPES, NOTIFICATION_ROUTES } from '@/common/constants';
import { NotificationDeliveryService } from '@/features/notifications/notification-delivery.service';

@Injectable()
export class NotificationDispatcherService {
  constructor(private readonly notificationDeliveryService: NotificationDeliveryService) {}

  async sendTop100Exited(gameId: GameId, guestId: string, rank: number): Promise<boolean> {
    return this.notificationDeliveryService.deliver({
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
    return this.notificationDeliveryService.deliver({
      locale,
      gameId,
      guestId,
      params: { rank },
      type: NOTIFICATION_TYPES.RANK_PUSH,
      route: NOTIFICATION_ROUTES.LEADERBOARD,
    });
  }
}
