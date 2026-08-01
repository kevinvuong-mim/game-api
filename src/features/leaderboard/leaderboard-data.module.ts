import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infra/prisma/prisma.module';
import { LeaderboardRepository } from '@/features/leaderboard/leaderboard.repository';

@Module({
  imports: [PrismaModule],
  providers: [LeaderboardRepository],
  exports: [LeaderboardRepository],
})
export class LeaderboardDataModule {}
