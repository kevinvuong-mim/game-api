import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AppService } from '@/app.service';
import { AppController } from '@/app.controller';
import { GuestModule } from '@/modules/guest/guest.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { PrismaModule } from '@/modules/prisma/prisma.module';
import { ResultsModule } from '@/modules/results/results.module';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { LeaderboardModule } from '@/modules/leaderboard/leaderboard.module';
import { MaintenanceModule } from '@/modules/maintenance/maintenance.module';

@Module({
  controllers: [AppController],
  providers: [AppService, RateLimitGuard],
  imports: [
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
