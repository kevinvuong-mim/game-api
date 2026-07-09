export const RATE_LIMITS = {
  init: 5,
  name: 10,
  device: 10,
  result: 20,
  leaderboard: 30,
} as const;

/** 23:59 on days 28–31; handler skips unless tomorrow is the 1st. */
export const PARTITION_CRON = '59 23 28-31 * *';

export const AUTH_TOKEN_CACHE_TTL_SECONDS = 300;
