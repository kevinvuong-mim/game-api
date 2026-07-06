import { Module } from '@nestjs/common';

import { GuestModule } from '@/modules/guest/guest.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { ResultsService } from '@/modules/results/results.service';
import { ResultsController } from '@/modules/results/results.controller';
import { ResultsRepository } from '@/modules/results/results.repository';
import { LeaderboardRankTrackerService } from '@/modules/leaderboard/leaderboard-rank-tracker.service';

@Module({
  controllers: [ResultsController],
  imports: [GuestModule, RedisModule],
  exports: [ResultsService, ResultsRepository, LeaderboardRankTrackerService],
  providers: [ResultsService, ResultsRepository, LeaderboardRankTrackerService],
})
export class ResultsModule {}
