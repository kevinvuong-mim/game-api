import { Module } from '@nestjs/common';

import { ResultsDataModule } from '@/features/results/results-data.module';
import { LeaderboardService } from '@/features/leaderboard/leaderboard.service';
import { LeaderboardController } from '@/features/leaderboard/leaderboard.controller';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';
import { LeaderboardRankTrackerService } from '@/features/leaderboard/leaderboard-rank-tracker.service';

@Module({
  imports: [ResultsDataModule],
  controllers: [LeaderboardController],
  exports: [LeaderboardRankTrackerService, LeaderboardRankResolverService],
  providers: [LeaderboardService, LeaderboardRankTrackerService, LeaderboardRankResolverService],
})
export class LeaderboardModule {}
