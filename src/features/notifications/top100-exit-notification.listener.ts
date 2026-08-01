import { OnEvent } from '@nestjs/event-emitter';
import { Logger, Injectable } from '@nestjs/common';

import { PlayerExitedTop100Event } from '@/domain/events';
import { NotificationDeliveryService } from '@/features/notifications/notification-delivery.service';

@Injectable()
export class Top100ExitNotificationListener {
  private readonly logger = new Logger(Top100ExitNotificationListener.name);

  constructor(private readonly notificationDelivery: NotificationDeliveryService) {}

  @OnEvent(PlayerExitedTop100Event.EVENT, { async: true })
  async handleExited(event: PlayerExitedTop100Event): Promise<void> {
    this.logger.log(
      `Player exited Top 100: game=${event.gameId} guest=${event.guestId} rank=${event.rank}`,
    );

    const sent = await this.notificationDelivery.sendTop100Exited(
      event.gameId,
      event.guestId,
      event.rank,
    );

    if (!sent) {
      this.logger.warn(
        `Top 100 exit notification skipped: game=${event.gameId} guest=${event.guestId}`,
      );
    }
  }
}
