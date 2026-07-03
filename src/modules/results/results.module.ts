import { Module } from '@nestjs/common';

import { GuestModule } from '@/modules/guest/guest.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { ResultsService } from '@/modules/results/results.service';
import { ResultsController } from '@/modules/results/results.controller';
import { ResultsRepository } from '@/modules/results/results.repository';

@Module({
  controllers: [ResultsController],
  imports: [GuestModule, RedisModule],
  exports: [ResultsService, ResultsRepository],
  providers: [ResultsService, ResultsRepository],
})
export class ResultsModule {}
