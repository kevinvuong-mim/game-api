import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { NOTIFICATION_QUEUE } from '@/common/constants';
import {
  SaturdayRankProcessor,
  SaturdayRankCronService,
} from '@/modules/notifications/jobs/saturday-rank.job';
import { GuestModule } from '@/modules/guest/guest.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { FcmService } from '@/modules/notifications/services/fcm.service';
import { DevicesController } from '@/modules/notifications/controllers/devices.controller';
import { DeviceTokenService } from '@/modules/notifications/services/device-token.service';
import { SaturdayRankScheduler } from '@/modules/notifications/jobs/saturday-rank.scheduler';
import { DeviceTokenRepository } from '@/modules/notifications/repositories/device-token.repository';
import { Top100NotificationListener } from '@/modules/notifications/listeners/top100-notification.listener';
import { NotificationDispatcherService } from '@/modules/notifications/services/notification-dispatcher.service';

@Module({
  providers: [
    FcmService,
    DeviceTokenService,
    DeviceTokenRepository,
    SaturdayRankProcessor,
    SaturdayRankScheduler,
    SaturdayRankCronService,
    Top100NotificationListener,
    NotificationDispatcherService,
  ],
  controllers: [DevicesController],
  imports: [
    GuestModule,
    RedisModule,
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE.SATURDAY_RANK,
    }),
  ],
  exports: [FcmService, DeviceTokenService, NotificationDispatcherService],
})
export class NotificationsModule {}
