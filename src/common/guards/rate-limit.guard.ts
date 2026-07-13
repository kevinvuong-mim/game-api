import {
  Logger,
  HttpStatus,
  Injectable,
  CanActivate,
  HttpException,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';

import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
  type AuthenticatedGuest,
} from '@/common/decorators';
import { RedisService } from '@/infra/redis/redis.service';

type RateLimitRequest = Request & { user?: AuthenticatedGuest };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

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
      if (options.keySource === 'guest') {
        throw new UnauthorizedException('Authentication required for rate limiting');
      }

      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    let allowed: boolean;
    try {
      allowed = await this.redisService.consumeRateLimit(
        `${options.keyPrefix}${keySuffix}`,
        options.limit,
        options.windowSeconds,
      );
    } catch {
      this.logger.warn(`Rate limit skipped — Redis unavailable (${options.keyPrefix}${keySuffix})`);
      return true;
    }

    if (!allowed) {
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  private extractClientIp(request: Request): string {
    // Use Express `request.ip` only. With `trust proxy` enabled in main.ts,
    // Express derives the client IP from X-Forwarded-For safely. Reading the
    // header here directly would let clients spoof rate-limit buckets.
    return request.ip ?? 'unknown';
  }
}
