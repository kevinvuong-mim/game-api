import { Module } from '@nestjs/common';

import { LeaderboardService } from '@/features/leaderboard/leaderboard.service';
import { LeaderboardController } from '@/features/leaderboard/leaderboard.controller';
import { LeaderboardDataModule } from '@/features/leaderboard/leaderboard-data.module';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';
import { LeaderboardRankTrackerService } from '@/features/leaderboard/leaderboard-rank-tracker.service';

@Module({
  imports: [LeaderboardDataModule],
  controllers: [LeaderboardController],
  exports: [LeaderboardRankTrackerService, LeaderboardRankResolverService, LeaderboardDataModule],
  providers: [LeaderboardService, LeaderboardRankTrackerService, LeaderboardRankResolverService],
})
export class LeaderboardModule {}
