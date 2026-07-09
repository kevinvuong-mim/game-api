import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infra/prisma/prisma.module';
import { ResultsRepository } from '@/features/results/results.repository';
import { MaintenanceModule } from '@/infra/maintenance/maintenance.module';

@Module({
  exports: [ResultsRepository],
  providers: [ResultsRepository],
  imports: [PrismaModule, MaintenanceModule],
})
export class ResultsDataModule {}
