import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AppService } from '@/app.service';
import { AppController } from '@/app.controller';
import { CommonModule } from '@/common/common.module';
import { GuestModule } from '@/modules/guest/guest.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { ResultsModule } from '@/modules/results/results.module';
import { LeaderboardModule } from '@/modules/leaderboard/leaderboard.module';
import { MaintenanceModule } from '@/modules/maintenance/maintenance.module';

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
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
  ],
})
export class AppModule {}
