import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

type RateLimitKeySource = 'ip' | 'guest';

export interface RateLimitOptions {
  limit: number;
  keyPrefix: string;
  windowSeconds: number;
  keySource: RateLimitKeySource;
}

/** One or more windows — every listed limit must pass. */
export const RateLimit = (...options: RateLimitOptions[]) => {
  if (options.length === 0) {
    throw new Error('RateLimit requires at least one options object');
  }
  return SetMetadata(RATE_LIMIT_KEY, options.length === 1 ? options[0] : options);
};
