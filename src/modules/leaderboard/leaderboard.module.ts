import { Module } from '@nestjs/common';

import { RedisModule } from '@/modules/redis/redis.module';
import { ResultsModule } from '@/modules/results/results.module';
import { LeaderboardService } from '@/modules/leaderboard/leaderboard.service';
import { LeaderboardController } from '@/modules/leaderboard/leaderboard.controller';

@Module({
  providers: [LeaderboardService],
  controllers: [LeaderboardController],
  imports: [RedisModule, ResultsModule],
})
export class LeaderboardModule {}
