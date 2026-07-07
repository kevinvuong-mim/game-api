import { Module, forwardRef } from '@nestjs/common';

import { GuestModule } from '@/features/guest/guest.module';
import { ResultsService } from '@/features/results/results.service';
import { ResultsController } from '@/features/results/results.controller';
import { ResultsRepository } from '@/features/results/results.repository';
import { LeaderboardModule } from '@/features/leaderboard/leaderboard.module';

@Module({
  controllers: [ResultsController],
  exports: [ResultsService, ResultsRepository],
  providers: [ResultsService, ResultsRepository],
  imports: [GuestModule, forwardRef(() => LeaderboardModule)],
})
export class ResultsModule {}
