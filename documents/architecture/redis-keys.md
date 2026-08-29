# Redis Keys

Redis is used for auth cache, rate limiting, and BullMQ. Two ioredis connections share `REDIS_URL`:

- `RedisService` (HTTP path): `maxRetriesPerRequest: 3`, connect/command timeouts — so rate-limit can fail-closed with 503 instead of hanging.
- BullMQ queues/workers: `maxRetriesPerRequest: null` (required by BullMQ).

> Leaderboard is **not** cached in Redis — queries hit PostgreSQL `leaderboards` directly.

## Auth token cache

| Property    | Value                                       |
| ----------- | ------------------------------------------- |
| Key pattern | `auth:token:{sha256Hash}`                   |
| Value       | JSON `{"guestId":"...","gameId":"FRULOOP"}` |
| TTL         | 300s (`AUTH_TOKEN_CACHE_TTL_SECONDS`)       |
| Set when    | Auth cache miss → DB lookup succeeds        |

`sha256Hash` = SHA-256 hex of the plain `secretToken`.

## Rate limit counters

Pattern: `{prefix}{suffix}` — suffix is client IP or `guestId`.

| Prefix         | Suffix  | Limit / window | Endpoint                               |
| -------------- | ------- | -------------- | -------------------------------------- |
| `rate:init:`   | IP      | 3 / 60s        | `POST /guest/init`                     |
| `rate:init:h:` | IP      | 15 / 3600s     | `POST /guest/init`                     |
| `rate:name:`   | guestId | 10 / 60s       | `PATCH /guest/name`                    |
| `rate:result:` | guestId | 20 / 60s       | `POST /results`                        |
| `rate:lb:`     | IP      | 30 / 60s       | `GET /leaderboards`                    |
| `rate:device:` | guestId | 10 / 60s       | Shared by POST/PATCH/DELETE `/devices` |

Implementation: **atomic Lua** `INCR` + `EXPIRE` (fixed window). Also re-applies TTL if a key somehow lost it.

Client IP comes from Express `request.ip` with `trust proxy = 1` in `main.ts` (do **not** read raw `X-Forwarded-For` in the guard).

**Fail-closed:** if Redis errors while evaluating a rate limit, the guard rejects the request with **503** (`Service Temporarily Unavailable`). Auth cache miss still falls back to DB.

## BullMQ

BullMQ uses the same `REDIS_URL` with its default `bull:` prefix. Queue/job internals create multiple Redis keys; they are owned by BullMQ rather than `RedisService`.

| Queue name               | Purpose                      |
| ------------------------ | ---------------------------- |
| `rank-push-notification` | Scheduled weekly `rank_push` |

Stable application `jobId`s (not Redis key names, but useful when inspecting BullMQ):

| Pattern                                              | Purpose                                    |
| ---------------------------------------------------- | ------------------------------------------ |
| `rank-push-batch-{gameId}-{weekKey}-start`           | Dedupe first batch of the weekly broadcast |
| `rank-push-batch-{gameId}-{weekKey}-{cursorGuestId}` | Dedupe subsequent cursor batch steps       |

## Rank-push send markers

| Property    | Value                                             |
| ----------- | ------------------------------------------------- |
| Key pattern | `rank-push:sent:{gameId}:{weekKey}:{guestId}`     |
| Value       | `"1"`                                             |
| TTL         | 8 days                                            |
| Set when    | Before FCM send (`SET NX`); cleared if send fails |

Prevents BullMQ job retries from re-notifying the same guest for the same ISO week.

See [schedule/fcm-notification-jobs.md](../schedule/fcm-notification-jobs.md).

## CLI (local)

```bash
docker-compose exec redis redis-cli
KEYS auth:token:*
KEYS rate:*
```

## Constants

`src/common/constants/runtime.constants.ts`:

```ts
RATE_LIMITS = { init: 3, initHourly: 15, name: 10, device: 10, result: 20, leaderboard: 30 };
AUTH_TOKEN_CACHE_TTL_SECONDS = 300;
SUBMIT_RESULT_TX = { maxWait: 10_000, timeout: 30_000 };
```
