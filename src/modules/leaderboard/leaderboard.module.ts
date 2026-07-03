import { Module } from '@nestjs/common';

import { RedisModule } from '@/modules/redis/redis.module';
import { ResultsModule } from '@/modules/results/results.module';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { LeaderboardService } from '@/modules/leaderboard/leaderboard.service';
import { LeaderboardController } from '@/modules/leaderboard/leaderboard.controller';

@Module({
  controllers: [LeaderboardController],
  imports: [RedisModule, ResultsModule],
  providers: [RateLimitGuard, LeaderboardService],
})
export class LeaderboardModule {}
