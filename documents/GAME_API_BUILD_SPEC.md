# BUILD SPEC — "Leaderboard-as-a-Service" Backend cho game guest-only

> Source of truth kèm theo: `prisma/schema.prisma`, `documents/architecture/database-schema.md`, `documents/architecture/notifications.md`, `documents/apis/devices.md`.

---

# 0. Mục tiêu

Xây dựng backend API cho game casual / hyper-casual.

Người chơi không đăng ký tài khoản, chỉ chơi dưới dạng guest.

Server đảm nhiệm:

- Lưu điểm số.
- Chống gian lận bằng HMAC (tập trung ở lớp chữ ký kết quả chơi, không phải xác thực người dùng).
- Cung cấp leaderboard hiệu năng cao (hỗ trợ nhiều game độc lập).
- Push notification (FCM): Top 100, Saturday rank broadcast.
- Danh sách game được khai báo trong source code (type-safe, không cần bảng games).

## Triết lý

- Không có bí mật tuyệt đối – secret nằm trong client (inject qua env, không hardcode), nhưng được dùng để chống giả mạo, không phải mã hóa dữ liệu.
- Xác thực guest chỉ dùng token đơn giản (Bearer) để ngăn kẻ xấu giả mạo người chơi khác. Token được cache ngắn hạn trong Redis để tránh query DB mỗi request.
- Token vĩnh viễn — không có TTL, không rotate. Mỗi lần cài app = một guest mới. Uninstall/clear data = mất data, không relink. Behavior đồng nhất iOS và Android.
- Kiểm tra toàn vẹn dữ liệu bằng HMAC trên từng kết quả.

---

# 1. Tech Stack

- NestJS 11
- Prisma 6
- PostgreSQL 16
- Redis 8 (ioredis)
- `@nestjs/schedule`
- `@nestjs/bullmq` + `bullmq` (FCM delivery + Saturday rank broadcast)
- `@nestjs/event-emitter` (Top 100 notification events)
- `firebase-admin` (FCM push — optional, graceful disable khi thiếu env)
- `@nestjs/config`
- `helmet`, `compression`
- `class-validator`, `class-transformer`
- Node ≥ 20
- Package manager: `npm`

### Path Alias

```text
@/* → src/*
```

### Global Prefix

```text
/api
```

### ValidationPipe (toàn cục)

Cấu hình trong `src/main.ts`, kèm `exceptionFactory` tùy chỉnh để map lỗi class-validator sang mảng `{ field, constraint, message, value }`:

```ts
new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: true },
  exceptionFactory: (errors) => {
    const formattedErrors = errors.flatMap((error) => {
      if (!error.constraints) return [];
      return Object.entries(error.constraints).map(([key, message]) => ({
        constraint: key,
        message,
        value: error.value,
        field: error.property,
      }));
    });
    return new HttpException(
      { statusCode: 400, error: 'Bad Request', message: formattedErrors },
      400,
    );
  },
});
```

### Response Interceptor (thành công)

```json
{
  "success": true,
  "data": {},
  "statusCode": 200,
  "path": "",
  "timestamp": "",
  "message": ""
}
```

### Exception Filter (lỗi)

```json
{
  "success": false,
  "error": "",
  "message": "",
  "path": "",
  "statusCode": 400,
  "timestamp": "",
  "errors": [],
  "stack": ""
}
```

> `stack` chỉ hiển thị khi `NODE_ENV !== 'production'`
> `errors` chỉ có khi validation lỗi (class-validator)

### HTTP Status

| Mã  | Ý nghĩa                                              |
| --- | ---------------------------------------------------- |
| 200 | Thành công                                           |
| 201 | Tạo mới thành công                                   |
| 400 | Validation lỗi                                       |
| 401 | Token không hợp lệ                                   |
| 403 | Guest không thuộc game (ví dụ `gameId` body ≠ token) |
| 404 | gameId không tồn tại                                 |
| 429 | Rate limit                                           |
| 503 | DB hoặc Redis không kết nối                          |
| 500 | Lỗi nội bộ                                           |

---

# 2. Cấu trúc thư mục

```text
src/
  main.ts
  app.module.ts
  app.controller.ts
  app.service.ts

  common/
    constants/
      game.constants.ts
      notification.constants.ts
      runtime.constants.ts
      index.ts
    utils/
      crypto.util.ts
      game.util.ts
      index.ts
    guards/
      guest-auth.guard.ts
      rate-limit.guard.ts
    decorators/
      guest.decorator.ts
      rate-limit.decorator.ts
    validators/
      is-valid-metadata.validator.ts
    interceptors/
      response.interceptor.ts
    filters/
      http-exception.filter.ts

  features/
    guest/
    results/
    leaderboard/
    notifications/
      notifications.module.ts
      devices.controller.ts
      fcm.service.ts
      device-token.service.ts
      device-token.repository.ts
      notification-dispatcher.service.ts
      notification-queue.service.ts
      top100-notification.listener.ts
      jobs/
        saturday-rank.job.ts
        saturday-rank.scheduler.ts
        fcm-delivery.job.ts
      dto/

  domain/
    events/

  infra/
    prisma/
    redis/
    maintenance/

documents/
  apis/
  architecture/
  schedule/
  setup/

prisma/
  schema.prisma
  migrations/
    20260708083230_initial_database/
    20260708083230_partition_game_results/

docker-compose.yml
.env
.env.example
```

---

# 3. Game Config

`GameId` re-export từ `@prisma/client`. `replaySecret` khai báo trong `GAME_CONFIG` (64-char hex).

```ts
// src/common/constants/game.constants.ts
import { GameId } from '@prisma/client';

export { GameId };

export const GAME_CONFIG: Record<GameId, { name: string; replaySecret: string }> = {
  [GameId.FRULOOP]: {
    name: 'Fruloop',
    replaySecret: '...fixed value...',
  },
};

export function validateGameId(gameId: string): GameId {
  /* ... */
}
export function getGameConfig(gameId: GameId) {
  /* ... */
}
```

### Startup Guard

`validateGameSecrets()` chạy trong `main.ts` trước khi tạo Nest app (Section 11).

### Thêm game mới

1. Thêm giá trị vào enum `GameId` trong `prisma/schema.prisma`
2. Chạy `npm run prisma:generate` + migration
3. Thêm entry vào `GAME_CONFIG` — TypeScript báo lỗi nếu thiếu (`Record<GameId, ...>`)
4. Cập nhật client: `VITE_GAME_ID`, `VITE_REPLAY_SECRET`

---

# 4. Prisma Schema

Database gồm **3 bảng** nghiệp vụ chính. Device token và notification state nằm trên `guest_players`. Không có `guest_device_tokens`, không có `notification_outbox`.

> **Partitioning:** Prisma không hỗ trợ native PostgreSQL partitioning. `game_results` partition theo `createdAt` qua custom SQL migration (Section 5).

```prisma
enum GameId { FRULOOP }
enum DevicePlatform { IOS ANDROID }
enum NotificationLocale { EN VI }

model GuestPlayer {
  // ID & Scope
  id     String @id @default(uuid())
  gameId GameId

  // Profile
  name String?

  // Authentication
  authTokenHash String @unique

  // Push Notification
  fcmToken           String?             @unique
  devicePlatform     DevicePlatform?
  notificationLocale NotificationLocale?

  // Notification State
  inTop100 Boolean @default(false)

  // Timestamps
  createdAt DateTime @default(now())

  gameResults  GameResult[]
  leaderboards Leaderboard?

  @@unique([gameId, id])
  @@map("guest_players")
}

model GameResult {
  id        String   @default(uuid())
  createdAt DateTime @default(now())
  gameId    GameId
  guestId   String
  clientResultId String
  score     Int
  replayHash String
  metadata  Json?
  playedAt  DateTime?

  guest GuestPlayer @relation(fields: [gameId, guestId], references: [gameId, id], onDelete: Cascade)

  @@id([id, createdAt])
  @@index([gameId, guestId, clientResultId])
  @@index([gameId, guestId])
  @@index([gameId, createdAt])
  @@map("game_results")
}

model Leaderboard {
  gameId    GameId
  guestId   String
  bestScore Int
  updatedAt DateTime @updatedAt

  guest GuestPlayer @relation(fields: [gameId, guestId], references: [gameId, id], onDelete: Cascade)

  @@id([gameId, guestId])
  @@index([gameId, bestScore(sort: Desc)])
  @@map("leaderboards")
}
```

Chi tiết đầy đủ: `prisma/schema.prisma`, `documents/architecture/database-schema.md`.

---

# 5. Partition

## Quy trình migration

1. `prisma migrate dev` tạo `game_results` dạng table thường (`initial_database` migration).
2. Custom SQL migration chuyển sang `PARTITION BY RANGE ("createdAt")`.
3. Migration tự tạo partition theo năm cho dữ liệu cũ + năm hiện tại + năm kế tiếp.

Migration hiện tại: `prisma/migrations/20260708083230_partition_game_results/migration.sql`

### Partition creation trong migration (self-contained)

```sql
DO $$
DECLARE
  min_year INT;
  max_year INT;
  start_year INT;
  end_year INT;
  year_value INT;
BEGIN
  SELECT
    EXTRACT(YEAR FROM MIN("createdAt"))::INT,
    EXTRACT(YEAR FROM MAX("createdAt"))::INT
  INTO min_year, max_year
  FROM "game_results_old";

  start_year := COALESCE(min_year, EXTRACT(YEAR FROM NOW())::INT);
  end_year := GREATEST(
    COALESCE(max_year, EXTRACT(YEAR FROM NOW())::INT),
    EXTRACT(YEAR FROM NOW())::INT + 1
  );

  FOR year_value IN start_year..end_year LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "game_results" FOR VALUES FROM (%L) TO (%L)',
      'game_results_' || year_value,
      make_date(year_value, 1, 1),
      make_date(year_value + 1, 1, 1)
    );
  END LOOP;
END $$;
```

### UNIQUE trên partitioned table

PostgreSQL yêu cầu UNIQUE constraint trên partitioned table phải chứa partition key. Vì vậy **không có** `UNIQUE (gameId, guestId, clientResultId)` toàn cục.

Dedup dùng Postgres advisory lock trong transaction:

```ts
function dedupLockKey(gameId: string, guestId: string, clientResultId: string): bigint {
  const hash = crypto
    .createHash('sha256')
    .update(`${gameId}|${guestId}|${clientResultId}`)
    .digest();
  return hash.readBigInt64BE(0);
}
```

```sql
SELECT pg_advisory_xact_lock($lockKey);
SELECT 1 FROM game_results
WHERE "gameId" = $gameId AND "guestId" = $guestId AND "clientResultId" = $clientResultId
LIMIT 1;
-- Nếu chưa tồn tại → INSERT
```

## Cron tạo partition tự động

`MaintenanceService` (`src/infra/maintenance/maintenance.service.ts`):

- Cron: `0 3 1 * *` + chạy lúc startup (`onModuleInit`)
- Đảm bảo partition cho **năm hiện tại** và **năm kế tiếp**
- Idempotent: `CREATE TABLE IF NOT EXISTS` qua check `pg_class`

---

# 6. Endpoints

> Chi tiết request/response: `documents/apis/`.

Tất cả response thành công được bọc qua `ResponseInterceptor`, **trừ** payload service đã có field `success` (`POST /results`, `DELETE /devices`, `PATCH /devices/preferences`).

## Auth (Bearer token)

```text
Authorization: Bearer <secretToken>

sha256(token)
→ Redis auth:token:{hash} (TTL 300s)
→ miss: SELECT guest_players WHERE authTokenHash = tokenHash
→ 401 nếu không tìm thấy
→ attach request.user = { guestId, gameId }
```

## GET /api/health

Không auth. Kiểm tra Postgres + Redis.

## POST /api/guest/init

Rate limit: `5/60s` per IP.

Response `data`:

```json
{
  "guestId": "uuid",
  "gameId": "FRULOOP",
  "secretToken": "raw-token-plain-text"
}
```

## PATCH /api/guest/name

Auth required. Rate limit: `10/60s` per guest.

## POST /api/results

Auth required. Rate limit: `20/60s` per guest. Batch 1–50 items.

### HMAC payload

```ts
const payload = `${gameId}|${guestId}|${clientResultId}|${score}|${playedAt || ''}`;
```

### Flow

1. Validate + auth
2. Verify HMAC từng item (skip invalid, không fail cả batch)
3. Dedup + insert qua advisory lock (Section 5)
4. Upsert `leaderboards` với `GREATEST(bestScore, newScore)`
5. Update Redis sorted set
6. Top 100 detection → domain events → notification queue

Response (flat body, không bọc envelope):

```json
{
  "success": true,
  "message": "Results submitted",
  "insertedCount": 2,
  "rejectedCount": 0
}
```

## GET /api/leaderboards

Public. Rate limit: `30/60s` per IP.

Query: `gameId`, `page`, `limit`, `guestId?` (self rank).

Logic: Redis `leaderboard:{gameId}` → fallback PostgreSQL → cold start rebuild top 1000.

## Devices API (`/api/devices`)

Auth required. Rate limit: `10/60s` per guest.

| Method | Path                       | Mô tả                                             |
| ------ | -------------------------- | ------------------------------------------------- |
| POST   | `/api/devices`             | Đăng ký FCM token (`token`, `platform`, `locale`) |
| PATCH  | `/api/devices`             | Cập nhật token / locale                           |
| DELETE | `/api/devices`             | Unregister (clear `fcmToken` + device fields)     |
| PATCH  | `/api/devices/preferences` | Bật/tắt push qua Redis mute (`enabled: boolean`)  |

Device data lưu trên `guest_players`: `fcmToken`, `devicePlatform`, `notificationLocale`.

Register/Update response `data`:

```json
{ "guestId": "uuid" }
```

Unregister/Preferences response `data`:

```json
{ "success": true }
```

Không có endpoint heartbeat. Không có `deviceId`, không có `status` ACTIVE/INACTIVE/INVALID.

Chi tiết: `documents/apis/devices.md`.

### Push notification types

| `type`            | Trigger                             | FCM `data.route` |
| ----------------- | ----------------------------------- | ---------------- |
| `top_100_entered` | Vào Top 100 sau submit score        | `Leaderboard`    |
| `top_100_exited`  | Rời Top 100                         | `Leaderboard`    |
| `saturday_rank`   | Cron `0 9 * * 6` (Asia/Ho_Chi_Minh) | `Leaderboard`    |

---

# 7. Push Notifications

Kiến trúc đơn giản: **không DB outbox**, enqueue trực tiếp BullMQ.

```text
Trigger (Top 100 event / Saturday cron)
  → NotificationDispatcherService
  → NotificationQueueService.enqueue()
  → BullMQ queue fcm-delivery
  → FcmDeliveryProcessor → NotificationQueueService.deliver()
  → FcmService.sendToToken()
```

## Điều kiện gửi

1. Guest không mute (`notification:muted:{gameId}:{guestId}` không tồn tại trên Redis)
2. Guest có `fcmToken` trong `guest_players`
3. Saturday rank: guest phải có rank trên leaderboard

## Saturday dedupe

`jobId` ổn định theo tuần: `{gameId}:{guestId}:saturday_rank:{YYYY-Www}` — BullMQ không enqueue trùng trong cùng tuần.

## Invalid token

FCM lỗi `registration-token-not-registered` / `invalid-registration-token` → clear `fcmToken`, `devicePlatform`, `notificationLocale` trên `guest_players`.

## BullMQ queues

| Queue                        | Worker                  |
| ---------------------------- | ----------------------- |
| `fcm-delivery`               | `FcmDeliveryProcessor`  |
| `saturday-rank-notification` | `SaturdayRankProcessor` |

Không có retry scheduler / outbox recovery cron.

Chi tiết: `documents/architecture/notifications.md`, `documents/schedule/fcm-notification-jobs.md`.

---

# 8. Redis

```text
Auth token cache:
  Key:   auth:token:{sha256Hash}
  Value: JSON { "guestId", "gameId" }
  TTL:   300s

Leaderboard cache:
  Key:    leaderboard:{gameId}
  Member: guestId
  Score:  bestScore
  Max:    1000 entries (LEADERBOARD_CACHE_MAX)

Notification mute:
  Key: notification:muted:{gameId}:{guestId}
  Value: "1" (SET khi mute, DEL khi unmute)

Rate limit:
  Key: rate:{prefix}:{id}
  TTL: window seconds
```

Sau POST /results:

```text
ZADD leaderboard:{gameId} {bestScore} {guestId}
ZREMRANGEBYRANK leaderboard:{gameId} 0 -(LEADERBOARD_CACHE_MAX+1)
```

Chi tiết: `documents/architecture/redis-keys.md`.

---

# 9. HMAC Anti-cheat

```text
HMAC-SHA256(
  replaySecret,
  `${gameId}|${guestId}|${clientResultId}|${score}|${playedAt || ''}`
)
```

So sánh bằng `crypto.timingSafeEqual`. `replaySecret` từ `GAME_CONFIG`, không đọc từ env.

---

# 10. Rate Limit

Redis counter (`INCR` + `EXPIRE`). Guard: `RateLimitGuard` + `@RateLimit`.

| Endpoint                                               | Limit | Window | Key source | Prefix         |
| ------------------------------------------------------ | ----: | -----: | ---------- | -------------- |
| POST /guest/init                                       |     5 |    60s | IP         | `rate:init:`   |
| PATCH /guest/name                                      |    10 |    60s | guest      | `rate:name:`   |
| POST /results                                          |    20 |    60s | guest      | `rate:result:` |
| GET /leaderboards                                      |    30 |    60s | IP         | `rate:lb:`     |
| POST/PATCH/DELETE /devices, PATCH /devices/preferences |    10 |    60s | guest      | `rate:device:` |

`GET /api/health` không rate limit.

---

# 11. Startup Guard

```ts
// main.ts
validateGameSecrets();
const app = await NestFactory.create(AppModule);
```

Kiểm tra mọi `GameId` trong `GAME_CONFIG` có `replaySecret` hợp lệ (64-char hex). Sai → app không khởi động.

---

# 12. Auth

`GuestAuthGuard` lookup `authTokenHash` trên `guest_players`. Cache Redis 5 phút.

Decorator `@Guest()` inject `{ guestId, gameId }`.

---

# 13. Crypto & Game Utils

**`crypto.util.ts`:** `generateSecretToken`, `hashSecretToken`, `computeReplaySignature`, `verifyReplaySignature`, `isValidSha256Hex`, `dedupLockKey`

**`game.util.ts`:** `validateGameSecrets`, `buildReplayPayload`

---

# 14. Environment Variables

```env
DATABASE_URL="postgresql://..."
REDIS_URL="redis://localhost:6379"
PORT=3000
NODE_ENV=development

# Optional — FCM push (thiếu → push disabled)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

`replaySecret` **không** đọc từ env — nằm trong `GAME_CONFIG`.

Chi tiết: `documents/setup/environment-variables.md`.

---

# 15. npm scripts

```json
{
  "start:dev": "nest start --watch",
  "build": "nest build",
  "start:prod": "node dist/main",
  "prisma:migrate": "prisma migrate dev",
  "prisma:generate": "prisma generate",
  "prisma:reset": "prisma migrate reset",
  "lint": "eslint \"src/**/*.ts\" --fix"
}
```

---

# 16. Quy trình triển khai

```bash
npm install
docker-compose up -d
cp .env.example .env
npm run prisma:migrate
npm run start:dev
# → http://localhost:3000/api
```

Migrations:

- `20260708083230_initial_database` — 3 bảng + enums
- `20260708083230_partition_game_results` — partition `game_results`

Production: `npm run build && npm run start:prod`

---

# 17. Logging & Monitoring

- NestJS `Logger` trong bootstrap, filters, services
- Không log: `replaySecret`, `secretToken` (raw), `authTokenHash`
- Stack trace chỉ trong response khi `NODE_ENV !== 'production'`

---

# 18. CORS

```ts
app.enableCors({
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
});
```

Production nên hạn chế origin qua reverse proxy.

---

# 19. Bảo mật bổ sung

- `helmet`, `compression`
- `timingSafeEqual` cho HMAC
- Rate limit trên guest/results/leaderboard/devices
- Startup guard cho `replaySecret`
- `app.enableShutdownHooks()` cho graceful shutdown

---

# 20. Trade-off

| Ưu điểm                        | Nhược điểm                                     |
| ------------------------------ | ---------------------------------------------- |
| Schema gọn (3 bảng)            | Push không có DB outbox/retry                  |
| Không cần bảng games           | Thêm game phải deploy lại                      |
| Verify HMAC nhanh              | Secret nằm trong client (env)                  |
| Redis cache nhanh              | Redis restart → rebuild leaderboard cache      |
| Partition tối ưu write/archive | Custom SQL migration cho partition             |
| Token vĩnh viễn, đơn giản      | Uninstall/clear data = mất guest, không relink |

---

# 21. Đồng bộ với game-starter-kit (frontend)

| Điểm đồng bộ        | Backend                                                                 | Frontend (game-starter-kit)           |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------- |
| GameId              | `GameId` enum trong Prisma + `GAME_CONFIG`                              | `VITE_GAME_ID`                        |
| replaySecret        | `GAME_CONFIG[gameId].replaySecret`                                      | `VITE_REPLAY_SECRET`                  |
| HMAC payload        | `${gameId}\|${guestId}\|${clientResultId}\|${score}\|${playedAt\|\|''}` | Idem (`game-sync` module)             |
| API base URL        | `/api`, PORT=3000                                                       | `VITE_API_URL`                        |
| Response envelope   | `{ success, statusCode, message, data, path, timestamp }`               | `ApiClient` envelope                  |
| Auth header         | `Authorization: Bearer <secretToken>`                                   | `ApiClient.setAuthToken(secretToken)` |
| Token persistence   | Không TTL                                                               | Capacitor Preferences `gsk:guest`     |
| FCM device          | `POST/PATCH/DELETE /api/devices`, `PATCH /api/devices/preferences`      | `notifications` module                |
| Device API response | `{ guestId }` (register/update)                                         | Không dùng `deviceId`                 |
| Push payload        | FCM `data: { type, route }`                                             | In-app navigation (`Leaderboard`)     |
| Batch limits        | 1–50 items per request                                                  | `MAX_BATCH_SIZE = 50`                 |
| playedAt format     | ISO8601 strict                                                          | ISO8601 string                        |
| metadata limits     | max 10 keys, 2048 bytes                                                 | Documented trong game-starter-kit     |
