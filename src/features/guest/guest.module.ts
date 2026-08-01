import { Module } from '@nestjs/common';

import { GuestService } from '@/features/guest/guest.service';
import { GuestController } from '@/features/guest/guest.controller';

/** Guest HTTP API. GuestRepository + GuestAuthGuard come from global CommonModule. */
@Module({
  controllers: [GuestController],
  providers: [GuestService],
})
export class GuestModule {}
