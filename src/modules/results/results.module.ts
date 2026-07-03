import { Module } from '@nestjs/common';

import { GuestModule } from '@/modules/guest/guest.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { ResultsService } from '@/modules/results/results.service';
import { ResultsController } from '@/modules/results/results.controller';
import { ResultsRepository } from '@/modules/results/results.repository';

@Module({
  controllers: [ResultsController],
  imports: [GuestModule, RedisModule],
  exports: [ResultsService, ResultsRepository],
  providers: [ResultsService, RateLimitGuard, ResultsRepository],
})
export class ResultsModule {}
