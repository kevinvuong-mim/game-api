import { APP_GUARD } from '@nestjs/core';
import { Global, Module } from '@nestjs/common';

import { RedisModule } from '@/infra/redis/redis.module';
import { ApiKeyGuard } from '@/common/guards/api-key.guard';
import { PrismaModule } from '@/infra/prisma/prisma.module';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { GuestAuthGuard } from '@/common/guards/guest-auth.guard';
import { GuestDataModule } from '@/features/guest/guest-data.module';

/**
 * Auth + rate-limit guards. GuestAuth depends on GuestRepository via GuestDataModule.
 * Feature modules do not need to import GuestModule solely for the auth guard.
 */
@Global()
@Module({
  imports: [RedisModule, PrismaModule, GuestDataModule],
  exports: [GuestDataModule, GuestAuthGuard, RateLimitGuard],
  providers: [GuestAuthGuard, RateLimitGuard, { provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class CommonModule {}
