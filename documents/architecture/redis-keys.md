# Redis Keys

Redis is used for auth cache, rate limiting, and BullMQ. Client: ioredis via `RedisService` (`src/infra/redis/redis.service.ts`).

Connection: `REDIS_URL`.

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

| Prefix         | Suffix  | Limit / 60s | Endpoint            |
| -------------- | ------- | ----------- | ------------------- |
| `rate:init:`   | IP      | 5           | `POST /guest/init`  |
| `rate:name:`   | guestId | 10          | `PATCH /guest/name` |
| `rate:result:` | guestId | 20          | `POST /results`     |
| `rate:lb:`     | IP      | 30          | `GET /leaderboards` |
| `rate:device:` | guestId | 10          | Shared by POST/PATCH/DELETE `/devices` |

Implementation: **atomic Lua** `INCR` + `EXPIRE` (fixed 60s window). Also re-applies TTL if a key somehow lost it.

Client IP comes from Express `request.ip` with `trust proxy = 1` in `main.ts` (do **not** read raw `X-Forwarded-For` in the guard).

**Fail-open:** if Redis errors, rate-limit and auth-cache guards allow the request (auth falls back to DB).

## BullMQ

BullMQ uses the same `REDIS_URL` with its default `bull:` prefix. Queue/job internals create multiple Redis keys; they are owned by BullMQ rather than `RedisService`.

| Queue name               | Purpose                      |
| ------------------------ | ---------------------------- |
| `rank-push-notification` | Scheduled weekly `rank_push` |

Stable application `jobId`s (not Redis key names, but useful when inspecting BullMQ):

| Pattern | Purpose |
| --- | --- |
| `rank-push-start-{gameId}-{weekKey}` | Dedupe start-of-week broadcast enqueue |
| `rank-push-batch-{gameId}-{weekKey}-…` | Dedupe batch chain steps |

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
RATE_LIMITS = { init: 5, name: 10, device: 10, result: 20, leaderboard: 30 };
AUTH_TOKEN_CACHE_TTL_SECONDS = 300;
```
