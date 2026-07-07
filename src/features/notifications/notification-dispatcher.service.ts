import { Injectable } from '@nestjs/common';

import { type GameId, NOTIFICATION_TYPES, NOTIFICATION_ROUTES } from '@/common/constants';
import { NotificationOutboxService } from '@/features/notifications/notification-outbox.service';

@Injectable()
export class NotificationDispatcherService {
  constructor(private readonly outboxService: NotificationOutboxService) {}

  async sendTop100Entered(gameId: GameId, guestId: string, rank: number): Promise<string | null> {
    return this.outboxService.enqueue({
      gameId,
      guestId,
      params: { rank },
      route: NOTIFICATION_ROUTES.LEADERBOARD,
      type: NOTIFICATION_TYPES.TOP_100_ENTERED,
    });
  }

  async sendTop100Exited(gameId: GameId, guestId: string, rank: number): Promise<string | null> {
    return this.outboxService.enqueue({
      gameId,
      guestId,
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
    await this.outboxService.enqueue({
      locale,
      gameId,
      guestId,
      params: { rank },
      route: NOTIFICATION_ROUTES.LEADERBOARD,
      type: NOTIFICATION_TYPES.SATURDAY_RANK,
      idempotencyKey: this.outboxService.buildSaturdayRankIdempotencyKey(gameId, guestId),
    });
  }
}
