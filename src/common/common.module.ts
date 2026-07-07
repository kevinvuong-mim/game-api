import { Global, Module } from '@nestjs/common';

import { RedisModule } from '@/infra/redis/redis.module';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';

@Global()
@Module({
  imports: [RedisModule],
  exports: [RateLimitGuard],
  providers: [RateLimitGuard],
})
export class CommonModule {}
