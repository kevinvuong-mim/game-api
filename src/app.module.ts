import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AppService } from '@/app.service';
import { AppController } from '@/app.controller';
import { CommonModule } from '@/common/common.module';
import { GuestModule } from '@/modules/guest/guest.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { ResultsModule } from '@/modules/results/results.module';
import { LeaderboardModule } from '@/modules/leaderboard/leaderboard.module';
import { MaintenanceModule } from '@/modules/maintenance/maintenance.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';

@Module({
  providers: [AppService],
  controllers: [AppController],
  imports: [
    CommonModule,
    GuestModule,
    RedisModule,
    PrismaModule,
    ResultsModule,
    LeaderboardModule,
    MaintenanceModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL'),
        },
      }),
    }),
  ],
})
export class AppModule {}
