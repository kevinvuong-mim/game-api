import { Module } from '@nestjs/common';

import { GuestModule } from '@/features/guest/guest.module';
import { ResultsService } from '@/features/results/results.service';
import { ResultsController } from '@/features/results/results.controller';
import { ResultsDataModule } from '@/features/results/results-data.module';
import { LeaderboardModule } from '@/features/leaderboard/leaderboard.module';

@Module({
  exports: [ResultsService],
  providers: [ResultsService],
  controllers: [ResultsController],
  imports: [GuestModule, ResultsDataModule, LeaderboardModule],
})
export class ResultsModule {}
