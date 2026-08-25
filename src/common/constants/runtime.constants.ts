export const RATE_LIMITS = {
  /** Per-IP guest create — short window. */
  init: 3,
  name: 10,
  device: 10,
  result: 20,
  /** Per-IP guest create — hourly ceiling (anti-bot). */
  initHourly: 15,
  leaderboard: 30,
} as const;

/** Client header (`X-Api-Key`); Express stores incoming names in lowercase. */
export const API_KEY_HEADER = 'x-api-key';

/** 23:59 on days 28–31; handler skips unless tomorrow is the 1st. */
export const PARTITION_CRON = '59 23 28-31 * *';

export const AUTH_TOKEN_CACHE_TTL_SECONDS = 300;
