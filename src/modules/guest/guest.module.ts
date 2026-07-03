import { Module } from '@nestjs/common';

import { RedisModule } from '@/modules/redis/redis.module';
import { GuestService } from '@/modules/guest/guest.service';
import { GuestAuthGuard } from '@/common/guards/guest-auth.guard';
import { GuestController } from '@/modules/guest/guest.controller';
import { GuestRepository } from '@/modules/guest/guest.repository';

@Module({
  imports: [RedisModule],
  controllers: [GuestController],
  exports: [GuestService, GuestAuthGuard, GuestRepository],
  providers: [GuestService, GuestAuthGuard, GuestRepository],
})
export class GuestModule {}
