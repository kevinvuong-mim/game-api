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
import { FcmDeliveryProcessor } from '@/modules/notifications/jobs/fcm-delivery.job';
import { FcmRetryScheduler } from '@/modules/notifications/jobs/fcm-retry.scheduler';
import { DevicesController } from '@/modules/notifications/controllers/devices.controller';
import { DeviceTokenService } from '@/modules/notifications/services/device-token.service';
import { SaturdayRankScheduler } from '@/modules/notifications/jobs/saturday-rank.scheduler';
import { DeviceTokenRepository } from '@/modules/notifications/repositories/device-token.repository';
import { NotificationOutboxService } from '@/modules/notifications/services/notification-outbox.service';
import { Top100NotificationListener } from '@/modules/notifications/listeners/top100-notification.listener';
import { NotificationDispatcherService } from '@/modules/notifications/services/notification-dispatcher.service';
import { NotificationOutboxRepository } from '@/modules/notifications/repositories/notification-outbox.repository';

@Module({
  exports: [
    FcmService,
    DeviceTokenService,
    NotificationOutboxService,
    NotificationDispatcherService,
  ],
  providers: [
    FcmService,
    FcmRetryScheduler,
    DeviceTokenService,
    FcmDeliveryProcessor,
    DeviceTokenRepository,
    SaturdayRankProcessor,
    SaturdayRankScheduler,
    SaturdayRankCronService,
    NotificationOutboxService,
    Top100NotificationListener,
    NotificationOutboxRepository,
    NotificationDispatcherService,
  ],
  controllers: [DevicesController],
  imports: [
    GuestModule,
    RedisModule,
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE.FCM_DELIVERY,
    }),
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE.SATURDAY_RANK,
    }),
  ],
})
export class NotificationsModule {}
