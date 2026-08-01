import { Module } from '@nestjs/common';

import { GuestService } from '@/features/guest/guest.service';
import { GuestController } from '@/features/guest/guest.controller';
import { GuestDataModule } from '@/features/guest/guest-data.module';

/** Guest HTTP API. GuestRepository comes from GuestDataModule; GuestAuthGuard from CommonModule. */
@Module({
  providers: [GuestService],
  imports: [GuestDataModule],
  controllers: [GuestController],
})
export class GuestModule {}
