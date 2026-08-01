import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infra/prisma/prisma.module';
import { LeaderboardRepository } from '@/features/leaderboard/leaderboard.repository';
import { LeaderboardScoreApplyService } from '@/features/leaderboard/leaderboard-score-apply.service';

@Module({
  imports: [PrismaModule],
  providers: [LeaderboardRepository, LeaderboardScoreApplyService],
  exports: [LeaderboardRepository, LeaderboardScoreApplyService],
})
export class LeaderboardDataModule {}
