import { Module } from '@nestjs/common';

import { GuestService } from '@/features/guest/guest.service';
import { GuestAuthGuard } from '@/common/guards/guest-auth.guard';
import { GuestController } from '@/features/guest/guest.controller';
import { GuestRepository } from '@/features/guest/guest.repository';

@Module({
  controllers: [GuestController],
  exports: [GuestAuthGuard, GuestRepository],
  providers: [GuestService, GuestAuthGuard, GuestRepository],
})
export class GuestModule {}
