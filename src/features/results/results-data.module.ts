import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infra/prisma/prisma.module';
import { ResultsRepository } from '@/features/results/results.repository';

@Module({
  imports: [PrismaModule],
  exports: [ResultsRepository],
  providers: [ResultsRepository],
})
export class ResultsDataModule {}
