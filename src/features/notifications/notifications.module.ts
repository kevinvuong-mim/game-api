import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { NOTIFICATION_QUEUE } from '@/common/constants';
import {
  RankPushProcessor,
  RankPushCronService,
} from '@/features/notifications/jobs/rank-push.job';
import { GuestModule } from '@/features/guest/guest.module';
import { FcmService } from '@/features/notifications/fcm.service';
import { LeaderboardModule } from '@/features/leaderboard/leaderboard.module';
import { DevicesController } from '@/features/notifications/devices.controller';
import { DeviceTokenService } from '@/features/notifications/device-token.service';
import { DeviceTokenRepository } from '@/features/notifications/device-token.repository';
import { RankPushScheduler } from '@/features/notifications/jobs/rank-push.scheduler';
import { Top100NotificationListener } from '@/features/notifications/top100-notification.listener';
import { NotificationDeliveryService } from '@/features/notifications/notification-delivery.service';
import { NotificationDispatcherService } from '@/features/notifications/notification-dispatcher.service';

@Module({
  providers: [
    FcmService,
    DeviceTokenService,
    DeviceTokenRepository,
    RankPushProcessor,
    RankPushScheduler,
    RankPushCronService,
    Top100NotificationListener,
    NotificationDeliveryService,
    NotificationDispatcherService,
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
