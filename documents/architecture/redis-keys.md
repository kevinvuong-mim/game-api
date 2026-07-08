# Redis Keys

Redis dùng cho auth cache, leaderboard cache, rate limiting, và notification mute flag. Client: ioredis qua `RedisService` (`src/infra/redis/redis.service.ts`).

Connection: biến môi trường `REDIS_URL`.

## Auth token cache

| Thuộc tính | Giá trị |
| ---------- | ------- |
| Key pattern | `auth:token:{sha256Hash}` |
| Value | JSON `{"guestId":"...","gameId":"FRULOOP"}` |
| TTL | 300 giây (`AUTH_TOKEN_CACHE_TTL_SECONDS`) |
| Set khi | Guest auth cache miss → lookup DB thành công |

`sha256Hash` = SHA-256 hex của `secretToken` plain text.

> Value **phải** chứa cả `gameId` và `guestId` — `POST /results` đối chiếu `guest.gameId` với body mà không query DB thêm khi cache hit.

## Leaderboard cache

| Thuộc tính | Giá trị |
| ---------- | ------- |
| Key pattern | `leaderboard:{gameId}` |
| Type | Sorted set (ZSET) |
| Member | `guestId` |
| Score | `bestScore` |
| TTL | Không đặt (persistent) |
| Max entries | 1000 (`LEADERBOARD_CACHE_MAX`) |

**Operations:**

- `ZREVRANGE` — lấy trang leaderboard
- `ZREVRANK` — rank của guest
- `ZADD` — cập nhật sau submit score
- `ZREMRANGEBYRANK` — trim khi vượt 1000 entries

**Cold start:** Khi `ZCARD = 0`, rebuild top 1000 từ PostgreSQL `leaderboards` → bulk `ZADD`.

**Redis restart:** Key mất → cold start tự rebuild ở request đầu tiên. Không mất dữ liệu nguồn (PostgreSQL).

## Notification mute flag

| Thuộc tính | Giá trị |
| ---------- | ------- |
| Key pattern | `notification:muted:{gameId}:{guestId}` |
| Value | `"1"` khi muted |
| TTL | Không đặt |

Set khi:

- `DELETE /api/devices` — unregister
- `PATCH /api/devices/preferences` với `enabled: false`

Xóa khi:

- `POST /api/devices` — register
- `PATCH /api/devices` — update
- `PATCH /api/devices/preferences` với `enabled: true`

## Rate limit counters

Pattern: `{prefix}{suffix}` — suffix là IP hoặc `guestId`.

| Prefix | Suffix | Limit / 60s | Endpoint |
| ------ | ------ | ----------- | -------- |
| `rate:init:` | client IP | 5 | `POST /guest/init` |
| `rate:name:` | guestId | 10 | `PATCH /guest/name` |
| `rate:result:` | guestId | 20 | `POST /results` |
| `rate:lb:` | client IP | 30 | `GET /leaderboards` |
| `rate:device:` | guestId | 10 | `/devices/*` |

Implementation: `INCR` + `EXPIRE` trên lần INCR đầu tiên (fixed window 60 giây).

IP lấy từ `X-Forwarded-For` (phần tử đầu) hoặc `request.ip`.

## BullMQ queues

BullMQ dùng Redis riêng cho job metadata (prefix mặc định `bull:`). Hai queue chính:

| Queue name | Mục đích |
| ---------- | -------- |
| `fcm-delivery` | Gửi từng notification outbox row |
| `saturday-rank-notification` | Batch broadcast Saturday rank |

Chi tiết job: [schedule/fcm-notification-jobs.md](../schedule/fcm-notification-jobs.md).

## CLI examples (local dev)

```bash
docker-compose exec redis redis-cli

# Auth cache
KEYS auth:token:*

# Leaderboard
ZCARD leaderboard:FRULOOP
ZREVRANGE leaderboard:FRULOOP 0 9 WITHSCORES
ZREVRANK leaderboard:FRULOOP <guestId>

# Rate limit (debug)
KEYS rate:*

# Mute flag
GET notification:muted:FRULOOP:<guestId>
```

## Constants reference

File: `src/common/constants/runtime.constants.ts`

```ts
RATE_LIMITS = { init: 5, name: 10, device: 10, result: 20, leaderboard: 30 }
LEADERBOARD_CACHE_MAX = 1000
AUTH_TOKEN_CACHE_TTL_SECONDS = 300
```
