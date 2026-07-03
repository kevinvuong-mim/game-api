import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { REDIS_CLIENT, RedisService, createRedisClient } from './redis.service';

@Module({
  providers: [
    RedisService,
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: createRedisClient,
    },
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
