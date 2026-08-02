import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infra/prisma/prisma.module';
import { ResultsService } from '@/features/results/results.service';
import { ResultsController } from '@/features/results/results.controller';
import { ResultsRepository } from '@/features/results/results.repository';
import { MaintenanceModule } from '@/infra/maintenance/maintenance.module';
import { LeaderboardModule } from '@/features/leaderboard/leaderboard.module';
import { NotificationsModule } from '@/features/notifications/notifications.module';
import { LeaderboardDataModule } from '@/features/leaderboard/leaderboard-data.module';

@Module({
  imports: [
    PrismaModule,
    MaintenanceModule,
    LeaderboardModule,
    NotificationsModule,
    LeaderboardDataModule,
  ],
  controllers: [ResultsController],
  providers: [ResultsService, ResultsRepository],
})
export class ResultsModule {}
