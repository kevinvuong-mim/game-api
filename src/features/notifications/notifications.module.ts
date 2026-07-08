import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';

import { NOTIFICATION_QUEUE } from '@/common/constants';
import {
  SaturdayRankProcessor,
  SaturdayRankCronService,
} from '@/features/notifications/jobs/saturday-rank.job';
import { GuestModule } from '@/features/guest/guest.module';
import { ResultsModule } from '@/features/results/results.module';
import { FcmService } from '@/features/notifications/fcm.service';
import { LeaderboardModule } from '@/features/leaderboard/leaderboard.module';
import { DevicesController } from '@/features/notifications/devices.controller';
import { DeviceTokenService } from '@/features/notifications/device-token.service';
import { FcmDeliveryProcessor } from '@/features/notifications/jobs/fcm-delivery.job';
import { DeviceTokenRepository } from '@/features/notifications/device-token.repository';
import { SaturdayRankScheduler } from '@/features/notifications/jobs/saturday-rank.scheduler';
import { NotificationQueueService } from '@/features/notifications/notification-queue.service';
import { Top100NotificationListener } from '@/features/notifications/top100-notification.listener';
import { NotificationDispatcherService } from '@/features/notifications/notification-dispatcher.service';

@Module({
  exports: [
    FcmService,
    DeviceTokenService,
    NotificationQueueService,
    NotificationDispatcherService,
  ],
  providers: [
    FcmService,
    DeviceTokenService,
    FcmDeliveryProcessor,
    DeviceTokenRepository,
    SaturdayRankProcessor,
    SaturdayRankScheduler,
    SaturdayRankCronService,
    NotificationQueueService,
    Top100NotificationListener,
    NotificationDispatcherService,
  ],
  controllers: [DevicesController],
  imports: [
    GuestModule,
    forwardRef(() => ResultsModule),
    forwardRef(() => LeaderboardModule),
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE.FCM_DELIVERY,
    }),
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE.SATURDAY_RANK,
    }),
  ],
})
export class NotificationsModule {}
