import { Module } from '@nestjs/common';

import { MaintenanceService } from '@/infra/maintenance/maintenance.service';

@Module({
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
