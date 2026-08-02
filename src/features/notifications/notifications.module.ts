import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { NOTIFICATION_QUEUE } from '@/common/constants';
import { FcmService } from '@/features/notifications/fcm.service';
import { GuestDataModule } from '@/features/guest/guest-data.module';
import { LeaderboardModule } from '@/features/leaderboard/leaderboard.module';
import { DevicesController } from '@/features/notifications/devices.controller';
import { DeviceTokenService } from '@/features/notifications/device-token.service';
import { RankPushProcessor } from '@/features/notifications/jobs/rank-push.processor';
import { RankPushScheduler } from '@/features/notifications/jobs/rank-push.scheduler';
import { RankPushEnqueueService } from '@/features/notifications/jobs/rank-push.enqueue';
import { NotificationDeliveryService } from '@/features/notifications/notification-delivery.service';

@Module({
  providers: [
    FcmService,
    RankPushProcessor,
    RankPushScheduler,
    DeviceTokenService,
    RankPushEnqueueService,
    NotificationDeliveryService,
  ],
  controllers: [DevicesController],
  exports: [NotificationDeliveryService],
  imports: [
    GuestDataModule,
    LeaderboardModule,
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE.RANK_PUSH,
    }),
  ],
})
export class NotificationsModule {}
