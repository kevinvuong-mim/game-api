import { OnEvent } from '@nestjs/event-emitter';
import { Logger, Injectable } from '@nestjs/common';

import { PlayerExitedTop100Event, PlayerEnteredTop100Event } from '@/domain/events';
import { NotificationDispatcherService } from '@/features/notifications/notification-dispatcher.service';
import { LeaderboardRankTrackerService } from '@/features/leaderboard/leaderboard-rank-tracker.service';

@Injectable()
export class Top100NotificationListener {
  private readonly logger = new Logger(Top100NotificationListener.name);

  constructor(
    private readonly notificationDispatcher: NotificationDispatcherService,
    private readonly rankTracker: LeaderboardRankTrackerService,
  ) {}

  @OnEvent(PlayerEnteredTop100Event.name, { async: true })
  async handleEntered(event: PlayerEnteredTop100Event): Promise<void> {
    this.logger.log(
      `Player entered Top 100: game=${event.gameId} guest=${event.guestId} rank=${event.rank}`,
    );

    const outboxId = await this.notificationDispatcher.sendTop100Entered(
      event.gameId,
      event.guestId,
      event.rank,
    );

    if (outboxId) {
      await this.rankTracker.confirmTop100Entered(event.gameId, event.guestId, event.rank);
    }
  }

  @OnEvent(PlayerExitedTop100Event.name, { async: true })
  async handleExited(event: PlayerExitedTop100Event): Promise<void> {
    this.logger.log(
      `Player exited Top 100: game=${event.gameId} guest=${event.guestId} rank=${event.rank}`,
    );

    const outboxId = await this.notificationDispatcher.sendTop100Exited(
      event.gameId,
      event.guestId,
      event.rank,
    );

    if (!outboxId) {
      this.logger.warn(
        `Top 100 exit notification skipped: game=${event.gameId} guest=${event.guestId}`,
      );
    }
  }
}
