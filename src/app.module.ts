import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AppService } from '@/app.service';
import { AppController } from '@/app.controller';
import { CommonModule } from '@/common/common.module';
import { GuestModule } from '@/features/guest/guest.module';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { ResultsModule } from '@/features/results/results.module';
import { MaintenanceModule } from '@/infra/maintenance/maintenance.module';
import { LeaderboardModule } from '@/features/leaderboard/leaderboard.module';
import { NotificationsModule } from '@/features/notifications/notifications.module';

@Module({
  providers: [AppService],
  controllers: [AppController],
  imports: [
    GuestModule,
    CommonModule,
    PrismaModule,
    ResultsModule,
    LeaderboardModule,
    MaintenanceModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
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
