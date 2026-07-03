import { Module } from '@nestjs/common';

import { RedisModule } from '@/modules/redis/redis.module';
import { ResultsModule } from '@/modules/results/results.module';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { LeaderboardController } from '@/modules/leaderboard/leaderboard.controller';
import { LeaderboardService } from '@/modules/leaderboard/leaderboard.service';

@Module({
  imports: [RedisModule, ResultsModule],
  controllers: [LeaderboardController],
  providers: [LeaderboardService, RateLimitGuard],
})
export class LeaderboardModule {}
