import { Module, forwardRef } from '@nestjs/common';

import { ResultsModule } from '@/features/results/results.module';
import { LeaderboardService } from '@/features/leaderboard/leaderboard.service';
import { LeaderboardController } from '@/features/leaderboard/leaderboard.controller';
import { LeaderboardRankTrackerService } from '@/features/leaderboard/leaderboard-rank-tracker.service';

@Module({
  controllers: [LeaderboardController],
  exports: [LeaderboardRankTrackerService],
  imports: [forwardRef(() => ResultsModule)],
  providers: [LeaderboardService, LeaderboardRankTrackerService],
})
export class LeaderboardModule {}
