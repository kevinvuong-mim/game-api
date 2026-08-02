import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infra/prisma/prisma.module';
import { PartitionService } from '@/infra/maintenance/partition.service';

@Module({
  imports: [PrismaModule],
  exports: [PartitionService],
  providers: [PartitionService],
})
export class MaintenanceModule {}
