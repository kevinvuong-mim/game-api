import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infra/prisma/prisma.module';
import { PartitionService } from '@/infra/maintenance/partition.service';
import { MaintenanceService } from '@/infra/maintenance/maintenance.service';

@Module({
  imports: [PrismaModule],
  exports: [PartitionService],
  providers: [PartitionService, MaintenanceService],
})
export class MaintenanceModule {}
