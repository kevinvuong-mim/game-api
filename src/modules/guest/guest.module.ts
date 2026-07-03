import { Module } from '@nestjs/common';

import { RedisModule } from '@/modules/redis/redis.module';
import { GuestAuthGuard } from '@/common/guards/guest-auth.guard';
import { GuestController } from '@/modules/guest/guest.controller';
import { GuestRepository } from '@/modules/guest/guest.repository';
import { GuestService } from '@/modules/guest/guest.service';

@Module({
  imports: [RedisModule],
  controllers: [GuestController],
  providers: [GuestService, GuestRepository, GuestAuthGuard],
  exports: [GuestService, GuestRepository, GuestAuthGuard],
})
export class GuestModule {}
