import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infra/prisma/prisma.module';
import { ResultsRepository } from '@/features/results/results.repository';
import { MaintenanceModule } from '@/infra/maintenance/maintenance.module';
import { LeaderboardDataModule } from '@/features/leaderboard/leaderboard-data.module';

@Module({
  exports: [ResultsRepository],
  providers: [ResultsRepository],
  imports: [PrismaModule, MaintenanceModule, LeaderboardDataModule],
})
export class ResultsDataModule {}
