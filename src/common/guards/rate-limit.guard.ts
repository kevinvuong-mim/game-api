import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
  type AuthenticatedGuest,
} from '@/common/decorators';
import { RedisService } from '@/modules/redis/redis.service';

type RateLimitRequest = Request & { user?: AuthenticatedGuest };

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RateLimitRequest>();
    const keySuffix =
      options.keySource === 'guest' ? request.user?.guestId : this.extractClientIp(request);

    if (!keySuffix) {
      return true;
    }

    const allowed = await this.redisService.consumeRateLimit(
      `${options.keyPrefix}${keySuffix}`,
      options.limit,
      options.windowSeconds,
    );

    if (!allowed) {
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private extractClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() ?? request.ip ?? 'unknown';
    }

    return request.ip ?? 'unknown';
  }
}
