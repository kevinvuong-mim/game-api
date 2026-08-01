import { Global, Module } from '@nestjs/common';

import { RedisModule } from '@/infra/redis/redis.module';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { GuestAuthGuard } from '@/common/guards/guest-auth.guard';
import { GuestRepository } from '@/features/guest/guest.repository';

/**
 * Auth + rate-limit guards. GuestAuth depends on GuestRepository (guest_players reads).
 * Feature modules no longer need to import GuestModule solely for the auth guard.
 */
@Global()
@Module({
  imports: [RedisModule, PrismaModule],
  providers: [GuestRepository, GuestAuthGuard, RateLimitGuard],
  exports: [GuestRepository, GuestAuthGuard, RateLimitGuard],
})
export class CommonModule {}
