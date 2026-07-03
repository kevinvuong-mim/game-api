import { Module } from '@nestjs/common';

import { GuestModule } from '@/modules/guest/guest.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { ResultsController } from '@/modules/results/results.controller';
import { ResultsRepository } from '@/modules/results/results.repository';
import { ResultsService } from '@/modules/results/results.service';

@Module({
  imports: [GuestModule, RedisModule],
  controllers: [ResultsController],
  providers: [ResultsService, ResultsRepository, RateLimitGuard],
  exports: [ResultsService, ResultsRepository],
})
export class ResultsModule {}
