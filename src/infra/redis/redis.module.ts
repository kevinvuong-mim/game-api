import { ConfigService } from '@nestjs/config';
import { Global, Module } from '@nestjs/common';

import { REDIS_CLIENT, RedisService, createRedisClient } from './redis.service';

@Global()
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
