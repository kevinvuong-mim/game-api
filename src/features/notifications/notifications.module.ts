import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import {
  RankPushProcessor,
  RankPushCronService,
} from '@/features/notifications/jobs/rank-push.job';
import { NOTIFICATION_QUEUE } from '@/common/constants';
import { GuestModule } from '@/features/guest/guest.module';
import { FcmService } from '@/features/notifications/fcm.service';
import { LeaderboardModule } from '@/features/leaderboard/leaderboard.module';
import { DevicesController } from '@/features/notifications/devices.controller';
import { DeviceTokenService } from '@/features/notifications/device-token.service';
import { RankPushScheduler } from '@/features/notifications/jobs/rank-push.scheduler';
import { DeviceTokenRepository } from '@/features/notifications/device-token.repository';
import { NotificationDeliveryService } from '@/features/notifications/notification-delivery.service';
import { NotificationDispatcherService } from '@/features/notifications/notification-dispatcher.service';
import { Top100ExitNotificationListener } from '@/features/notifications/top100-exit-notification.listener';

@Module({
  providers: [
    FcmService,
    RankPushProcessor,
    RankPushScheduler,
    DeviceTokenService,
    RankPushCronService,
    DeviceTokenRepository,
    NotificationDeliveryService,
    NotificationDispatcherService,
    Top100ExitNotificationListener,
  ],
  controllers: [DevicesController],
  imports: [
    GuestModule,
    LeaderboardModule,
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE.RANK_PUSH,
    }),
  ],
  exports: [FcmService, DeviceTokenService, NotificationDispatcherService],
})
export class NotificationsModule {}
