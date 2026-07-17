import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

type RateLimitKeySource = 'ip' | 'guest';

export interface RateLimitOptions {
  limit: number;
  keyPrefix: string;
  windowSeconds: number;
  keySource: RateLimitKeySource;
}

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
