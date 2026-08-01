import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { NOTIFICATION_QUEUE } from '@/common/constants';
import { FcmService } from '@/features/notifications/fcm.service';
import { LeaderboardModule } from '@/features/leaderboard/leaderboard.module';
import { DevicesController } from '@/features/notifications/devices.controller';
import { DeviceTokenService } from '@/features/notifications/device-token.service';
import { RankPushProcessor } from '@/features/notifications/jobs/rank-push.processor';
import { RankPushScheduler } from '@/features/notifications/jobs/rank-push.scheduler';
import { RankPushEnqueueService } from '@/features/notifications/jobs/rank-push.enqueue';
import { NotificationDeliveryService } from '@/features/notifications/notification-delivery.service';
import { Top100ExitNotificationListener } from '@/features/notifications/top100-exit-notification.listener';

@Module({
  providers: [
    FcmService,
    RankPushProcessor,
    RankPushScheduler,
    DeviceTokenService,
    RankPushEnqueueService,
    NotificationDeliveryService,
    Top100ExitNotificationListener,
  ],
  controllers: [DevicesController],
  imports: [
    LeaderboardModule,
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE.RANK_PUSH,
    }),
  ],
})
export class NotificationsModule {}
