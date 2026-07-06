import { OnEvent } from '@nestjs/event-emitter';
import { Logger, Injectable } from '@nestjs/common';

import { PlayerExitedTop100Event, PlayerEnteredTop100Event } from '@/modules/events';
import { NotificationDispatcherService } from '@/modules/notifications/services/notification-dispatcher.service';

@Injectable()
export class Top100NotificationListener {
  private readonly logger = new Logger(Top100NotificationListener.name);

  constructor(private readonly notificationDispatcher: NotificationDispatcherService) {}

  @OnEvent(PlayerEnteredTop100Event.name, { async: true })
  async handleEntered(event: PlayerEnteredTop100Event): Promise<void> {
    this.logger.log(
      `Player entered Top 100: game=${event.gameId} guest=${event.guestId} rank=${event.rank}`,
    );

    await this.notificationDispatcher.sendTop100Entered(event.gameId, event.guestId, event.rank);
  }

  @OnEvent(PlayerExitedTop100Event.name, { async: true })
  async handleExited(event: PlayerExitedTop100Event): Promise<void> {
    this.logger.log(
      `Player exited Top 100: game=${event.gameId} guest=${event.guestId} rank=${event.rank}`,
    );

    await this.notificationDispatcher.sendTop100Exited(event.gameId, event.guestId, event.rank);
  }
}
