import { Module } from '@nestjs/common';

import { MaintenanceService } from '@/modules/maintenance/maintenance.service';

@Module({
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
