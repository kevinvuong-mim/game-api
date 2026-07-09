# Redis Keys

Redis dùng cho auth cache, rate limiting, và notification mute flag. Client: ioredis qua `RedisService` (`src/infra/redis/redis.service.ts`).

Connection: biến môi trường `REDIS_URL`.

> Leaderboard **không** cache trên Redis — query trực tiếp PostgreSQL `leaderboards`.

## Auth token cache

| Thuộc tính  | Giá trị                                      |
| ----------- | -------------------------------------------- |
| Key pattern | `auth:token:{sha256Hash}`                    |
| Value       | JSON `{"guestId":"...","gameId":"FRULOOP"}`  |
| TTL         | 300 giây (`AUTH_TOKEN_CACHE_TTL_SECONDS`)    |
| Set khi     | Guest auth cache miss → lookup DB thành công |

`sha256Hash` = SHA-256 hex của `secretToken` plain text.

> Value **phải** chứa cả `gameId` và `guestId` — `POST /results` đối chiếu `guest.gameId` với body mà không query DB thêm khi cache hit.

## Notification mute flag

| Thuộc tính  | Giá trị                                 |
| ----------- | --------------------------------------- |
| Key pattern | `notification:muted:{gameId}:{guestId}` |
| Value       | `"1"` khi muted                         |
| TTL         | Không đặt                               |

Set khi:

- `PATCH /api/devices/preferences` với `enabled: false`

Xóa khi:

- `POST /api/devices` — register
- `PATCH /api/devices` — update
- `PATCH /api/devices/preferences` với `enabled: true`

`DELETE /api/devices` chỉ clear `fcmToken` / device fields — **không** tự động set mute. Client gọi `PATCH /devices/preferences` khi user tắt push.

## Rate limit counters

Pattern: `{prefix}{suffix}` — suffix là IP hoặc `guestId`.

| Prefix         | Suffix    | Limit / 60s | Endpoint            |
| -------------- | --------- | ----------- | ------------------- |
| `rate:init:`   | client IP | 5           | `POST /guest/init`  |
| `rate:name:`   | guestId   | 10          | `PATCH /guest/name` |
| `rate:result:` | guestId   | 20          | `POST /results`     |
| `rate:lb:`     | client IP | 30          | `GET /leaderboards` |
| `rate:device:` | guestId   | 10          | `/devices/*`        |

Implementation: `INCR` + `EXPIRE` trên lần INCR đầu tiên (fixed window 60 giây).

**Fail-open:** `RateLimitGuard` và `GuestAuthGuard` cho phép request khi Redis lỗi (log warning, fallback DB cho auth).

IP lấy từ `X-Forwarded-For` (phần tử đầu) hoặc `request.ip`.

## BullMQ queues

BullMQ dùng Redis riêng cho job metadata (prefix mặc định `bull:`). Queue chính:

| Queue name               | Mục đích                                |
| ------------------------ | --------------------------------------- |
| `rank-push-notification` | Batch scheduled rank push (`rank_push`) |

Chi tiết job: [schedule/fcm-notification-jobs.md](../schedule/fcm-notification-jobs.md).

## CLI examples (local dev)

```bash
docker-compose exec redis redis-cli

# Auth cache
KEYS auth:token:*

# Rate limit (debug)
KEYS rate:*

# Mute flag
GET notification:muted:FRULOOP:<guestId>
```

## Constants reference

File: `src/common/constants/runtime.constants.ts`

```ts
RATE_LIMITS = { init: 5, name: 10, device: 10, result: 20, leaderboard: 30 };
AUTH_TOKEN_CACHE_TTL_SECONDS = 300;
```
