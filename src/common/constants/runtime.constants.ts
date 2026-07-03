export const RATE_LIMITS = {
  init: 5,
  name: 10,
  result: 20,
  leaderboard: 30,
} as const;

export const LEADERBOARD_CACHE_MAX = 1000;

export const AUTH_TOKEN_CACHE_TTL_SECONDS = 300;

export const PARTITION_CRON = '0 3 1 * *';
