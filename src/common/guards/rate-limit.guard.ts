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
    const raw = this.reflector.getAllAndOverride<RateLimitOptions | RateLimitOptions[] | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!raw) {
      return true;
    }

    const optionsList = Array.isArray(raw) ? raw : [raw];
    const request = context.switchToHttp().getRequest<RateLimitRequest>();

    for (const options of optionsList) {
      const keySuffix =
        options.keySource === 'guest' ? request.user?.guestId : this.extractClientIp(request);

      if (!keySuffix) {
        throw new UnauthorizedException('Authentication required for rate limiting');
      }

      let allowed: boolean;
      try {
        allowed = await this.redisService.consumeRateLimit(
          `${options.keyPrefix}${keySuffix}`,
          options.limit,
          options.windowSeconds,
        );
      } catch {
        // Fail closed — without Redis we cannot enforce limits, so reject the request.
        this.logger.error(`Rate limit unavailable — Redis down (${options.keyPrefix}${keySuffix})`);
        throw new HttpException('Service Temporarily Unavailable', HttpStatus.SERVICE_UNAVAILABLE);
      }

      if (!allowed) {
        throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    return true;
  }

  private extractClientIp(request: Request): string {
    // Use Express `request.ip` only. With `trust proxy` enabled in main.ts,
    // Express derives the client IP from X-Forwarded-For safely. Reading the
    // header here directly would let clients spoof rate-limit buckets.
    return request.ip || 'unknown';
  }
}
