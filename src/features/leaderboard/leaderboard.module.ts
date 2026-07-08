import { Module, forwardRef } from '@nestjs/common';

import { ResultsModule } from '@/features/results/results.module';
import { LeaderboardService } from '@/features/leaderboard/leaderboard.service';
import { LeaderboardController } from '@/features/leaderboard/leaderboard.controller';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';
import { LeaderboardRankTrackerService } from '@/features/leaderboard/leaderboard-rank-tracker.service';

@Module({
  controllers: [LeaderboardController],
  imports: [forwardRef(() => ResultsModule)],
  exports: [LeaderboardRankTrackerService, LeaderboardRankResolverService],
  providers: [LeaderboardService, LeaderboardRankTrackerService, LeaderboardRankResolverService],
})
export class LeaderboardModule {}
