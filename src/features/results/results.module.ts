import { Module } from '@nestjs/common';

import { ResultsService } from '@/features/results/results.service';
import { ResultsController } from '@/features/results/results.controller';
import { ResultsDataModule } from '@/features/results/results-data.module';
import { LeaderboardModule } from '@/features/leaderboard/leaderboard.module';

@Module({
  providers: [ResultsService],
  controllers: [ResultsController],
  imports: [ResultsDataModule, LeaderboardModule],
})
export class ResultsModule {}
