import { Injectable } from '@nestjs/common';

import { type GameId, NOTIFICATION_TYPES, NOTIFICATION_ROUTES } from '@/common/constants';
import { NotificationQueueService } from '@/features/notifications/notification-queue.service';

@Injectable()
export class NotificationDispatcherService {
  constructor(private readonly notificationQueueService: NotificationQueueService) {}

  async sendTop100Entered(gameId: GameId, guestId: string, rank: number): Promise<boolean> {
    return this.notificationQueueService.enqueue({
      gameId,
      guestId,
      params: { rank },
      route: NOTIFICATION_ROUTES.LEADERBOARD,
      type: NOTIFICATION_TYPES.TOP_100_ENTERED,
    });
  }

  async sendTop100Exited(gameId: GameId, guestId: string, rank: number): Promise<boolean> {
    return this.notificationQueueService.enqueue({
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
    const weekKey = this.getIsoWeekKey();
    await this.notificationQueueService.enqueue({
      locale,
      gameId,
      guestId,
      params: { rank },
      route: NOTIFICATION_ROUTES.LEADERBOARD,
      type: NOTIFICATION_TYPES.SATURDAY_RANK,
      jobId: `${gameId}:${guestId}:${NOTIFICATION_TYPES.SATURDAY_RANK}:${weekKey}`,
    });
  }

  private getIsoWeekKey(date = new Date()): string {
    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
}
