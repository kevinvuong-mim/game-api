import { Module } from '@nestjs/common';

import { LeaderboardService } from '@/features/leaderboard/leaderboard.service';
import { LeaderboardController } from '@/features/leaderboard/leaderboard.controller';
import { LeaderboardDataModule } from '@/features/leaderboard/leaderboard-data.module';
import { LeaderboardRankResolverService } from '@/features/leaderboard/leaderboard-rank.resolver';

@Module({
  imports: [LeaderboardDataModule],
  controllers: [LeaderboardController],
  providers: [LeaderboardService, LeaderboardRankResolverService],
  exports: [LeaderboardRankResolverService, LeaderboardDataModule],
})
export class LeaderboardModule {}
