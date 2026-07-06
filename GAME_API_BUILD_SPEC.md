# BUILD SPEC — "Leaderboard-as-a-Service" Backend cho game guest-only

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
- `@nestjs/bullmq` + `bullmq` (Saturday rank broadcast queue)
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
      runtime.constants.ts   # RATE_LIMITS, PARTITION_CRON, LEADERBOARD_CACHE_MAX, AUTH_TOKEN_CACHE_TTL_SECONDS
      index.ts

    utils/
      crypto.util.ts         # token, HMAC, dedupLockKey
      game.util.ts           # validateGameSecrets, buildReplayPayload
      index.ts

    guards/
      guest-auth.guard.ts
      rate-limit.guard.ts
      index.ts

    decorators/
      guest.decorator.ts
      rate-limit.decorator.ts
      index.ts

    validators/
      is-valid-metadata.validator.ts
      index.ts

    interfaces/
      response.interface.ts
      index.ts

    interceptors/
      response.interceptor.ts
      index.ts

    filters/
      http-exception.filter.ts
      index.ts

  modules/
    prisma/
      prisma.module.ts
      prisma.service.ts

    redis/
      redis.module.ts
      redis.service.ts

    guest/
      guest.module.ts
      guest.controller.ts
      guest.service.ts
      guest.repository.ts
      dto/
        init-guest.dto.ts
        update-name.dto.ts

    leaderboard/
      leaderboard.module.ts
      leaderboard.controller.ts
      leaderboard.service.ts
      leaderboard-rank-tracker.service.ts
      dto/
        leaderboard-query.dto.ts

    notifications/
      notifications.module.ts
      controllers/devices.controller.ts
      services/fcm.service.ts
      services/device-token.service.ts
      services/notification-dispatcher.service.ts
      repositories/device-token.repository.ts
      listeners/top100-notification.listener.ts
      jobs/saturday-rank.job.ts
      jobs/saturday-rank.scheduler.ts
      dto/

    events/
      events/player-entered-top100.event.ts
      events/player-exited-top100.event.ts

    results/
      results.module.ts
      results.controller.ts
      results.service.ts
      results.repository.ts
      dto/
        submit-result.dto.ts
        submit-result-batch.dto.ts

    maintenance/
      maintenance.module.ts
      maintenance.service.ts

documents/
  apis/
    guest.md
    results.md
    leaderboard.md
    devices.md
    health-check.md
  schedule/
    game-results-partition.md
  setup/
    docker.md
    environment-variables.md

README.md
GAME_API_BUILD_SPEC.md

prisma/
  schema.prisma
  migrations/
    20260702084137_init/
    20260702084137_partition_game_results/   # custom SQL partition migration

docker-compose.yml
.env
.env.example
```

---

# 3. Game Config

`replaySecret` phải là SHA256 hex (64 ký tự), tối thiểu 32 bytes entropy, và được khai báo cố định trong source.

```ts
// src/common/constants/game.constants.ts

export enum GameId {
  FRULOOP = 'FRULOOP',
}

export const GAME_CONFIG: Record<GameId, { name: string; replaySecret: string }> = {
  [GameId.FRULOOP]: {
    name: 'Fruloop',
    replaySecret: '...fixed value...',
  },
} as const;
```

### Helper

```ts
export function validateGameId(gameId: string): GameId {
  if (!Object.values(GameId).includes(gameId as GameId)) {
    throw new NotFoundException(`Game "${gameId}" not supported`);
  }
  return gameId as GameId;
}

export function getGameConfig(gameId: GameId) {
  return GAME_CONFIG[gameId];
}
```

### Startup Guard

Xem Section 11 — `validateGameSecrets()` chạy trong `main.ts` trước khi tạo Nest app.

---

# 4. Prisma Schema

> **Lưu ý quan trọng về partitioning:** Prisma không hỗ trợ native PostgreSQL table partitioning. Việc `ALTER TABLE game_results PARTITION BY RANGE` phải thực hiện qua custom SQL migration (không phải `prisma migrate dev` thông thường). Xem Section 5 để biết quy trình chi tiết.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum GameId {
  FRULOOP
}

model GuestPlayer {
  id              String   @id @default(uuid())
  gameId          GameId
  name            String?
  secretTokenHash String
  createdAt       DateTime @default(now())

  gameResults         GameResult[]
  leaderboards        Leaderboard?
  deviceToken         GuestDeviceToken?
  notificationState   GuestNotificationState?

  @@unique([gameId, id])
  @@unique([secretTokenHash])
  @@map("guest_players")
}

model GameResult {
  id             String   @default(uuid())
  createdAt      DateTime @default(now())
  gameId         GameId
  guestId        String
  clientResultId String
  score          Int
  replayHash     String
  metadata       Json?
  playedAt       DateTime?

  guest GuestPlayer @relation(
    fields: [gameId, guestId],
    references: [gameId, id],
    onDelete: Cascade
  )

  // Composite PK bao gồm createdAt để hỗ trợ partition by range
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

  guest GuestPlayer @relation(
    fields: [gameId, guestId],
    references: [gameId, id],
    onDelete: Cascade
  )

  @@id([gameId, guestId])
  // Index cho leaderboard query: ORDER BY bestScore DESC WHERE gameId = ?
  @@index([gameId, bestScore(sort: Desc)])
  @@map("leaderboards")
}

enum DevicePlatform { IOS ANDROID }
enum DeviceTokenStatus { ACTIVE INACTIVE INVALID }
enum NotificationLocale { EN VI }

model GuestDeviceToken {
  id         String             @id @default(uuid())
  gameId     GameId
  guestId    String
  token      String             @unique
  platform   DevicePlatform
  locale     NotificationLocale @default(EN)
  status     DeviceTokenStatus  @default(ACTIVE)
  lastSeenAt DateTime           @default(now())
  // @@unique([gameId, guestId]) — 1 active token per guest per game
  @@map("guest_device_tokens")
}

model GuestNotificationState {
  gameId   GameId
  guestId  String
  inTop100 Boolean  @default(false)
  lastRank Int?
  @@id([gameId, guestId])
  @@map("guest_notification_states")
}
```

> Chi tiết schema đầy đủ: `prisma/schema.prisma`. Migration: `20260706033137_add_notification_tables`.

---

# 5. Partition

## Lưu ý về Prisma + PostgreSQL Partitioning

Prisma không hỗ trợ declarative partitioning. Vì vậy phải dùng **2-phase migration**:

1. Chạy `prisma migrate dev` để tạo `game_results` dạng table thường.
2. Tạo custom SQL migration để chuyển sang partitioned table.
3. Nếu migration được apply thủ công, đánh dấu trạng thái bằng `prisma migrate resolve`.

### Custom migration mẫu

```sql
-- prisma/migrations/XXXXXX_partition_game_results/migration.sql
-- Convert game_results into a range-partitioned table by createdAt.
-- Prisma doesn't support declarative partitioning, so this migration is pure SQL.

-- 1) Rename old constraints/indexes first to avoid name collisions
-- when creating the new parent table with the same canonical names.
ALTER TABLE "game_results" RENAME CONSTRAINT "game_results_pkey" TO "game_results_old_pkey";
ALTER TABLE "game_results" RENAME CONSTRAINT "game_results_gameId_guestId_fkey" TO "game_results_old_gameId_guestId_fkey";
ALTER INDEX "game_results_gameId_guestId_idx" RENAME TO "game_results_old_gameId_guestId_idx";
ALTER INDEX "game_results_gameId_createdAt_idx" RENAME TO "game_results_old_gameId_createdAt_idx";
ALTER INDEX "game_results_gameId_guestId_clientResultId_idx" RENAME TO "game_results_old_gameId_guestId_clientResultId_idx";

-- 2) Move old table out of the way.
ALTER TABLE "game_results" RENAME TO "game_results_old";

-- 3) Recreate partitioned parent table.
CREATE TABLE "game_results" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gameId" "GameId" NOT NULL,
  "guestId" TEXT NOT NULL,
  "clientResultId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "replayHash" TEXT NOT NULL,
  "metadata" JSONB,
  "playedAt" TIMESTAMP(3),
  CONSTRAINT "game_results_pkey" PRIMARY KEY ("id", "createdAt"),
  CONSTRAINT "game_results_gameId_guestId_fkey"
    FOREIGN KEY ("gameId", "guestId")
    REFERENCES "guest_players"("gameId", "id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
) PARTITION BY RANGE ("createdAt");

-- 4) Indexes for hot read paths and dedup lookup.
CREATE INDEX "game_results_gameId_guestId_idx" ON "game_results"("gameId", "guestId");
CREATE INDEX "game_results_gameId_createdAt_idx" ON "game_results"("gameId", "createdAt");
CREATE INDEX "game_results_gameId_guestId_clientResultId_idx" ON "game_results"("gameId", "guestId", "clientResultId");

-- 5) Seed first partition.
CREATE TABLE "game_results_2026"
  PARTITION OF "game_results"
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- 6) Copy old data into the partitioned table.
INSERT INTO "game_results" (
  "id",
  "createdAt",
  "gameId",
  "guestId",
  "clientResultId",
  "score",
  "replayHash",
  "metadata",
  "playedAt"
)
SELECT
  "id",
  "createdAt",
  "gameId",
  "guestId",
  "clientResultId",
  "score",
  "replayHash",
  "metadata",
  "playedAt"
FROM "game_results_old";

-- 7) Drop old table.
DROP TABLE "game_results_old";
```

Nếu migration được chạy ngoài `prisma migrate dev`, đánh dấu như sau:

```bash
prisma migrate resolve --applied 20260702084137_partition_game_results
```

### Lưu ý quan trọng về UNIQUE trên partitioned table

PostgreSQL yêu cầu mọi `UNIQUE` constraint/index trên partitioned table phải chứa **toàn bộ partition key**.
Vì `game_results` partition theo `createdAt`, nên `UNIQUE (gameId, guestId, clientResultId)` là **không hợp lệ**.

Giải pháp thực tế — dedup atomic bằng Postgres advisory lock (không dựa vào `ON CONFLICT`):

- Dùng index thường cho `(gameId, guestId, clientResultId)` để tối ưu lookup dedup (đã có sẵn ở `@@index([gameId, guestId, clientResultId])`).
- Vì không có unique index toàn cục nên **không thể dùng `INSERT ... ON CONFLICT` (upsert)** để dedup — 2 request đồng thời với cùng `clientResultId` có thể cùng pass check "chưa tồn tại" rồi cùng insert, tạo duplicate row.
- Giải pháp: mỗi item được xử lý trong **1 transaction riêng**, lấy **Postgres advisory lock theo transaction** (`pg_advisory_xact_lock`) với key là hash 64-bit của `(gameId, guestId, clientResultId)`, sau đó mới `SELECT ... WHERE gameId = ? AND guestId = ? AND clientResultId = ?`. Lock tự giải phóng khi transaction commit/rollback.

```ts
// Dedup key: hash 64-bit ổn định từ (gameId, guestId, clientResultId)
function dedupLockKey(gameId: string, guestId: string, clientResultId: string): bigint {
  const hash = crypto
    .createHash('sha256')
    .update(`${gameId}|${guestId}|${clientResultId}`)
    .digest();
  return hash.readBigInt64BE(0); // dùng làm key cho pg_advisory_xact_lock
}
```

```sql
-- Trong 1 transaction, cho từng item của batch:
SELECT pg_advisory_xact_lock($lockKey);

SELECT 1 FROM game_results
WHERE "gameId" = $gameId AND "guestId" = $guestId AND "clientResultId" = $clientResultId
LIMIT 1;
-- Nếu đã tồn tại → skip item này (đã insert trước đó), commit, next item
-- Nếu chưa tồn tại → INSERT INTO game_results (...) VALUES (...), commit
```

> Lý do dùng advisory lock thay vì "check rồi insert" đơn thuần: lock đảm bảo
> 2 request trùng `clientResultId` chạy đồng thời sẽ tuần tự hoá tại đúng
> item đó (không khoá toàn bảng), loại bỏ race condition mà vẫn tương thích
> với hạn chế "UNIQUE phải chứa partition key" ở trên.

## Partition mẫu

```sql
CREATE TABLE game_results_<YYYY>
  PARTITION OF game_results
  FOR VALUES FROM ('<YYYY>-01-01') TO ('<YYYY+1>-01-01');
```

## Cron tạo partition tự động

- Chạy ngày 1 mỗi tháng theo cron cố định `0 3 1 * *`
- Logic: kiểm tra xem partition cho **năm tiếp theo** đã tồn tại chưa
- Nếu chưa có → tạo mới bằng `prisma.$executeRawUnsafe`
- Nếu đã có → skip (idempotent)

---

# 6. Endpoints

> Chi tiết từng endpoint (request/response schema, use cases, lỗi thường gặp) nằm trong `documents/apis/`.

Tất cả response thành công được bọc qua `ResponseInterceptor` (xem Section 1). Ví dụ dưới đây hiển thị phần `data` hoặc envelope đầy đủ tùy ngữ cảnh.

## Auth (Bearer token)

Header:

```text
Authorization: Bearer <secretToken>
```

Server flow:

```text
sha256(token)
→ check Redis cache (TTL 5 phút)
→ nếu miss: query DB guest_players WHERE secretTokenHash = tokenHash
→ không tìm thấy → 401
→ tìm thấy → cache { guestId, gameId } → attach request.user
```

---

## GET /api/health

Không auth.

Response (bọc qua `ResponseInterceptor`):

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "status": "ok",
    "timestamp": "2026-01-15T10:00:00.000Z",
    "services": {
      "db": "connected",
      "redis": "connected"
    },
    "uptime": 12345
  },
  "path": "/api/health",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

DB hoặc Redis lỗi → `503` (error envelope, không bọc success)

---

## POST /api/guest/init

Rate limit: `5 requests / 60s` per IP

Body:

```json
{
  "gameId": "FRULOOP"
}
```

Flow:

1. Validate `gameId` qua `validateGameId()`
2. Rate limit check
3. Generate token (`generateSecretToken()`)
4. Hash token (`hashSecretToken()`)
5. Tạo GuestPlayer mới
6. Trả token về client (client tự lưu vĩnh viễn)

Response (201 Created, bọc envelope):

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "data": {
    "guestId": "uuid",
    "gameId": "FRULOOP",
    "secretToken": "raw-token-plain-text"
  },
  "path": "/api/guest/init",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

---

## PATCH /api/guest/name

Auth: Bearer token required

Rate limit: `10 / 60s` per guest

Body:

```json
{
  "name": "PlayerOne"
}
```

Response (200 OK, bọc envelope):

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource updated successfully",
  "data": {
    "guestId": "uuid",
    "gameId": "FRULOOP",
    "name": "PlayerOne"
  },
  "path": "/api/guest/name",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

---

## POST /api/results

Auth: Bearer token required

Rate limit: `20 / 60s` per guest

Body:

```json
{
  "gameId": "FRULOOP",
  "items": [
    {
      "clientResultId": "res-001",
      "score": 1500,
      "playedAt": "2026-01-15T10:00:00.000Z",
      "metadata": { "level": 5, "combo": 10 },
      "signature": "hmac-hex-string"
    }
  ]
}
```

**Validation (`SubmitResultBatchDto` / `SubmitResultDto`):**

- `items`: 1–50 phần tử
- `score`: integer ≥ 0
- `playedAt`: ISO8601 strict (optional)
- `metadata`: flat object, max 10 keys, max 2048 bytes JSON (`@IsValidMetadata`)
- `signature`: HMAC-SHA256 hex (64 ký tự)

### HMAC Verification

Payload phải khớp chính xác với client:

```ts
const payload = `${gameId}|${guestId}|${clientResultId}|${score}|${playedAt || ''}`;

const expected = computeReplaySignature(replaySecret, payload);
// so sánh bằng timingSafeEqual
```

### Flow

1. Validate `gameId` và body
2. Xác thực Bearer token (`GuestAuthGuard`)
3. Kiểm tra `guest.gameId === dto.gameId` — không khớp → `403 Forbidden`
4. Verify signature từng item (skip item invalid, không fail toàn batch)
5. Với từng item hợp lệ, dedup + insert **atomic** theo cơ chế advisory lock ở Section 5
6. Upsert leaderboard: chỉ update `bestScore` nếu score cao hơn hiện tại (`GREATEST`)
7. Update Redis sorted set nếu best score mới cao hơn trước đó
8. **Top 100 push** (khi có best score mới): `LeaderboardRankTrackerService` so rank trước/sau → emit event → `NotificationDispatcherService` → FCM (`top_100_entered` / `top_100_exited`)

> Lưu ý: bước 4 **không phải** `INSERT ... ON CONFLICT` (upsert) vì bảng
> `game_results` không thể có unique index trên `(gameId, guestId, clientResultId)`
> khi đã partition theo `createdAt` (xem Section 5). Dedup được đảm bảo atomic
> nhờ advisory lock trong transaction, không phải nhờ constraint ở tầng DB.

**Leaderboard upsert (idempotent, chống race condition):**

```sql
INSERT INTO leaderboards ("gameId", "guestId", "bestScore", "updatedAt")
VALUES ($gameId, $guestId, $score, now())
ON CONFLICT ("gameId", "guestId")
DO UPDATE SET
  "bestScore" = GREATEST(leaderboards."bestScore", EXCLUDED."bestScore"),
  "updatedAt" = now()
WHERE EXCLUDED."bestScore" > leaderboards."bestScore";
```

Response (201 Created, bọc envelope):

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "data": {
    "success": true,
    "insertedCount": 2,
    "rejectedCount": 0,
    "message": "Results submitted"
  },
  "path": "/api/results",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

> `insertedCount` có thể là `0` khi tất cả items duplicate hoặc signature invalid — vẫn HTTP 201. `rejectedCount` cho biết số item bị từ chối do chữ ký không hợp lệ; chi tiết trong `rejected`.

---

## GET /api/leaderboards

Auth: Không

Rate limit: `30 / 60s` per IP

Query params:

```text
gameId  (required)
page    (default: 1)
limit   (default: 20, max: 100)
guestId (optional, để lấy self rank)
```

Response (200 OK, bọc envelope):

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "gameId": "FRULOOP",
    "total": 150,
    "page": 1,
    "limit": 20,
    "items": [{ "rank": 1, "guestId": "uuid", "name": "PlayerOne", "bestScore": 9999 }],
    "self": { "rank": 12, "bestScore": 5000 }
  },
  "path": "/api/leaderboards?gameId=FRULOOP",
  "timestamp": "2026-01-15T10:00:00.000Z"
}
```

> `self` là `null` khi không truyền `guestId`, hoặc guest chưa có entry trên leaderboard. `name` có thể `null` nếu chưa gọi `PATCH /api/guest/name`.

Logic:

```text
1. Query Redis ZREVRANGE leaderboard:{gameId} với pagination
2. Nếu Redis miss hoặc down → fallback query PostgreSQL leaderboards table
3. self rank: ZREVRANK leaderboard:{gameId} {guestId}
   → nếu Redis miss → query DB: COUNT(*) WHERE gameId = ? AND bestScore > ?
```

**Redis Cold Start / Rebuild:**

Khi Redis khởi động lại hoặc key bị flush:

```text
Lần đầu tiên query leaderboard:{gameId} mà key không tồn tại:
→ Query top LEADERBOARD_CACHE_MAX từ DB
→ Bulk ZADD vào Redis
→ Tiếp tục serve request

Trigger: khi ZCARD leaderboard:{gameId} = 0
```

---

## Devices API (`/api/devices`)

Auth: Bearer token required. Rate limit: `10 / 60s` per guest.

| Method | Path                     | Mô tả                                             |
| ------ | ------------------------ | ------------------------------------------------- |
| POST   | `/api/devices`           | Đăng ký FCM token (`token`, `platform`, `locale`) |
| PATCH  | `/api/devices`           | Cập nhật token / locale                           |
| DELETE | `/api/devices`           | Unregister → `INACTIVE`                           |
| PATCH  | `/api/devices/heartbeat` | Cập nhật `lastSeenAt` (app resume)                |

Chi tiết: `documents/apis/devices.md`.

### Push notification types (server → client)

| `type`            | Trigger                                           | FCM `data.route` |
| ----------------- | ------------------------------------------------- | ---------------- |
| `top_100_entered` | Vào Top 100 sau submit score                      | `Leaderboard`    |
| `top_100_exited`  | Rời Top 100 (kể cả bị đẩy)                        | `Leaderboard`    |
| `saturday_rank`   | Cron `0 9 * * 6` (Asia/Ho_Chi_Minh), BullMQ batch | `Leaderboard`    |

- Saturday broadcast **chỉ gửi** guest có rank trên Redis leaderboard.
- Thiếu `FIREBASE_*` → FCM disabled; device APIs vẫn hoạt động.
- Client dùng in-app navigation từ `data.type` + `data.route` (không deeplink URL).

---

# 7. Redis

```text
Auth token cache:
Key:   auth:token:{sha256Hash}
Value: JSON { "guestId": "...", "gameId": "..." }
TTL:   AUTH_TOKEN_CACHE_TTL_SECONDS = 300 (5 phút)

Leaderboard cache:
Key:    leaderboard:{gameId}
Member: guestId
Score:  bestScore
TTL:    không đặt (persistent trong Redis)
Max:    LEADERBOARD_CACHE_MAX = 1000 entries
```

Hằng số trong `src/common/constants/runtime.constants.ts`.

> Auth cache value **phải** chứa cả `gameId` và `guestId` — `POST /results` đối chiếu `guest.gameId` với `body.gameId` mà không cần query DB thêm khi cache hit.

Khi update leaderboard sau POST /results:

```text
ZADD leaderboard:{gameId} {bestScore} {guestId}
ZREMRANGEBYRANK leaderboard:{gameId} 0 -(LEADERBOARD_CACHE_MAX+1)
```

---

# 8. HMAC Anti-cheat

Payload (build bằng `buildReplayPayload()` trong `game.util.ts`):

```text
HMAC-SHA256(
  replaySecret,
  `${gameId}|${guestId}|${clientResultId}|${score}|${playedAt || ''}`
)
```

> `playedAt` dùng đúng chuỗi ISO8601 gốc từ client, không reformat, để đảm bảo signature khớp.

Compute:

```ts
computeReplaySignature(replaySecret: string, payload: string): string
```

Compare:

```ts
crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
```

---

# 9. Rate Limit

Implement bằng Redis counter cố định (`INCR` + `EXPIRE` trên lần hit đầu tiên trong window). Guard: `RateLimitGuard` + decorator `@RateLimit`.

| Endpoint                                             | Limit | Window | Key source | Redis Key prefix        |
| ---------------------------------------------------- | ----: | -----: | ---------- | ----------------------- |
| POST /guest/init                                     |     5 |    60s | IP         | `rate:init:{ip}`        |
| PATCH /guest/name                                    |    10 |    60s | guest      | `rate:name:{guestId}`   |
| POST /results                                        |    20 |    60s | guest      | `rate:result:{guestId}` |
| GET /leaderboards                                    |    30 |    60s | IP         | `rate:lb:{ip}`          |
| POST/PATCH/DELETE /devices, PATCH /devices/heartbeat |    10 |    60s | guest      | `rate:device:{guestId}` |

> `GET /api/health` **không** có rate limit.

Hằng số limit nằm trong `src/common/constants/runtime.constants.ts` (`RATE_LIMITS`).

Vượt → `429 Too Many Requests`

---

# 10. Partition Maintenance

Cron schedule (fixed in source):

```text
Mặc định: 0 3 1 * * (3:00 sáng ngày 1 mỗi tháng)
```

Logic (triển khai trong `MaintenanceService.ensureNextYearPartition()`):

```ts
const nextYear = new Date().getFullYear() + 1;
const tableName = `game_results_${nextYear}`;

const exists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
  SELECT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = ${tableName}
  ) AS exists
`;

if (exists[0]?.exists) {
  return; // idempotent skip
}

const from = `${nextYear}-01-01`;
const to = `${nextYear + 1}-01-01`;

await prisma.$executeRawUnsafe(`
  CREATE TABLE ${tableName}
  PARTITION OF game_results
  FOR VALUES FROM ('${from}') TO ('${to}')
`);
```

> `MaintenanceService` cũng gọi `ensureNextYearPartition()` trong `onModuleInit()` để đảm bảo partition tồn tại ngay khi app khởi động (bổ sung cho cron hàng tháng).

---

# 11. Startup Guard

Chạy **trước** `NestFactory.create()` trong `src/main.ts`, gọi `validateGameSecrets()` từ `src/common/utils/game.util.ts`.

```ts
// main.ts
validateGameSecrets();
const app = await NestFactory.create(AppModule);
```

```ts
// game.util.ts
export function validateGameSecrets(): void {
  for (const gameId of Object.values(GameId)) {
    const config = getGameConfig(gameId);
    if (!config.replaySecret) {
      throw new Error(`[StartupGuard] Missing replaySecret for game: ${gameId}`);
    }
    if (!isValidSha256Hex(config.replaySecret)) {
      throw new Error(
        `[StartupGuard] Invalid replaySecret for game: ${gameId}. Must be 64-char hex string.`,
      );
    }
  }
}
```

Sai → throw Error → app không khởi động (fail-fast).

---

# 12. Auth

`GuestAuthGuard`:

```text
Lấy token từ header Authorization: Bearer <token>
→ sha256(token) → tokenHash
→ Check Redis: GET auth:token:{tokenHash}
  → Hit: parse JSON → { guestId, gameId } từ cache
  → Miss: query DB guest_players WHERE secretTokenHash = tokenHash
         → Không tìm thấy → 401
         → Tìm thấy → Cache kết quả:
             SET auth:token:{tokenHash} JSON.stringify({ guestId, gameId }) EX 300
→ Nếu không tìm thấy (cả cache lẫn DB) → 401
→ Attach vào request.user = { guestId, gameId }
```

> Cache value luôn là JSON `{ guestId, gameId }`, không chỉ `guestId`,
> để cache hit không cần query DB thêm lần nào mà vẫn đủ dữ liệu
> cho các route cần đối chiếu `gameId` (ví dụ `POST /results`).

Decorator:

```ts
@Guest()   // inject current guest từ request
```

---

# 13. Crypto & Game Utils

**`crypto.util.ts`**

```ts
generateSecretToken(): string          // URL-safe base64, 32 bytes entropy
hashSecretToken(token: string): string // SHA256 hex
timingSafeCompare(a: string, b: string): boolean
computeReplaySignature(secret: string, payload: string): string
verifyReplaySignature(secret: string, payload: string, received: string): boolean
isValidSha256Hex(value: string): boolean
dedupLockKey(gameId: string, guestId: string, clientResultId: string): bigint
```

**`game.util.ts`**

```ts
validateGameSecrets(): void           // startup guard (Section 11)
buildReplayPayload(params): string    // `${gameId}|${guestId}|${clientResultId}|${score}|${playedAt ?? ''}`
```

---

# 14. Environment Variables

```env
DATABASE_URL="postgresql://kwong2000:1234abcd@localhost:5432/game-api"

REDIS_URL=redis://localhost:6379

PORT=3000

NODE_ENV=development

# Optional — FCM push (thiếu → push disabled, server vẫn chạy)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

> **Khi thêm game mới:** Sửa `GameId` enum, `GAME_CONFIG` trong source và sync Prisma schema. Backend **không** đọc `replaySecret` từ biến môi trường — client dùng `VITE_REPLAY_SECRET` khớp với `GAME_CONFIG`.

> Firebase Admin (push): `documents/setup/environment-variables.md`. Client FCM: `game-starter-kit/documents/setup/firebase-native.md`.

---

# 15. npm scripts

```json
{
  "engines": { "node": ">=20" },
  "start:dev": "nest start --watch",
  "start:debug": "nest start --debug --watch",
  "build": "nest build",
  "start:prod": "node dist/main",
  "prisma:migrate": "prisma migrate dev",
  "prisma:generate": "prisma generate",
  "prisma:reset": "prisma migrate reset",
  "lint": "eslint \"src/**/*.ts\" --fix",
  "format": "prettier --write \"src/**/*.ts\""
}
```

---

# 16. Quy trình triển khai

```bash
npm install

docker-compose up -d

cp .env.example .env   # chỉnh DATABASE_URL, REDIS_URL

npm run prisma:migrate
# Migration partition đã có sẵn: prisma/migrations/20260702084137_partition_game_results/

npm run start:dev
# → http://localhost:3000/api

# Production
npm run build
npm run start:prod
```

### Thêm game mới

1. Thêm giá trị vào `GameId` enum trong `src/common/constants/game.constants.ts` **và** `prisma/schema.prisma`
2. Thêm entry vào `GAME_CONFIG` với `replaySecret` (64-char hex, ≥ 32 bytes entropy)
3. Chạy `npm run prisma:migrate` để sync enum PostgreSQL
4. Deploy backend và cập nhật client:
   - `VITE_GAME_ID` khớp `GameId` mới
   - `VITE_REPLAY_SECRET` khớp `GAME_CONFIG[gameId].replaySecret` trên backend
5. Không cần biến môi trường `REPLAY_SECRET_*` trên backend — secret nằm trong source `GAME_CONFIG`

### Rotate secret

```text
Phải release cùng lúc backend + client (coordinated deploy)
Trong cửa sổ rotate: signature cũ sẽ invalid → kết quả pending trên client bị từ chối
Nên rotate khi traffic thấp
```

---

# 17. Logging & Monitoring

**Đã triển khai:**

- NestJS `Logger` trong `Bootstrap`, `HttpExceptionFilter`, `MaintenanceService`
- `HttpExceptionFilter` log mỗi lỗi: `METHOD path - status - message` (+ stack trong dev)
- Stack trace trong response body chỉ khi `NODE_ENV !== 'production'`
- **Không bao giờ log:** `replaySecret`, `secretToken` (raw), `secretTokenHash`

**Chưa triển khai (optional / tương lai):**

- Request logging middleware (duration per request)
- `/api/metrics` (Prometheus)
- Tích hợp Sentry / Datadog

---

# 18. CORS

Cấu hình trong `src/main.ts` — **không** giới hạn `origin` cố định; cho phép mọi origin với credentials:

```ts
app.enableCors({
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
});
```

> Production nên đặt reverse proxy hoặc cập nhật `origin` whitelist nếu cần hạn chế domain.

---

# 19. Bảo mật bổ sung

- `helmet` — security headers (CSP chỉ bật khi `NODE_ENV === 'production'`)
- `compression` — gzip responses (threshold 1024 bytes, level 6)
- Không expose stack trace ở production (response body)
- Không log `replaySecret` hoặc `secretToken` raw
- Rate limit trên guest/results/leaderboard endpoints (`GET /health` không rate limit)
- `timingSafeEqual` cho so sánh HMAC signature
- Startup Guard chặn app khởi động nếu `replaySecret` sai format
- `app.enableShutdownHooks()` cho graceful shutdown

---

# 20. Trade-off

| Ưu điểm                        | Nhược điểm                                     |
| ------------------------------ | ---------------------------------------------- |
| Không cần bảng games           | Thêm game phải deploy lại                      |
| Verify HMAC nhanh              | Secret nằm trong client (env, không hardcode)  |
| Redis cache nhanh              | Redis mất data khi restart → cần rebuild logic |
| Partition tối ưu write/archive | Custom migration, Prisma không support native  |
| Token cache Redis              | Cache TTL 5 phút, cố định trong source         |
| Leaderboard upsert idempotent  | GREATEST() chỉ update khi score cao hơn        |
| Token vĩnh viễn, đơn giản      | Uninstall/clear data = mất data, không relink  |
| Behavior đồng nhất iOS/Android | Guest mới sau mỗi lần cài app                  |

---

# 21. Đồng bộ với game-starter-kit (frontend)

| Điểm đồng bộ        | Backend                                                                 | Frontend (game-starter-kit)                                           |
| ------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| GameId              | `GameId` enum trong `game.constants.ts`                                 | `VITE_GAME_ID` → `gameConfig.id` trong `src/game/config.ts`           |
| replaySecret        | `GAME_CONFIG[gameId].replaySecret` (hardcoded trong source)             | `VITE_REPLAY_SECRET` env var (phải khớp backend)                      |
| HMAC payload        | `${gameId}\|${guestId}\|${clientResultId}\|${score}\|${playedAt\|\|''}` | Idem (`game-sync` module)                                             |
| API base URL        | Global prefix `/api`, PORT=3000                                         | `VITE_API_URL` hoặc default trong platform config                     |
| Response envelope   | `{ success, statusCode, message, data, path, timestamp }`               | `ApiClient` envelope type                                             |
| Auth header         | `Authorization: Bearer <secretToken>`                                   | `ApiClient.setAuthToken(secretToken)`                                 |
| Token persistence   | Không TTL, không rotate, vĩnh viễn                                      | Lưu trong Capacitor Preferences `gsk:guest`                           |
| deviceId            | Không nhận trong body                                                   | Không gửi lên server                                                  |
| FCM device token    | `POST/PATCH /api/devices` — `token`, `platform`, `locale`               | `push-notification.service` sau `guest.onReady`                       |
| Push payload        | FCM `data: { type, route }` — EN/VI từ `locale` trên device record      | In-app navigation (`Leaderboard`, `DailyReward`) — không URL deeplink |
| Notification flags  | —                                                                       | `notification-env.json`: dev push off, local on                       |
| Guest init behavior | Mỗi lần gọi = tạo guest mới                                             | Chỉ gọi khi `gsk:guest` chưa có trong storage                         |
| Batch limits        | 1–50 items per request (`SubmitResultBatchDto`)                         | `MAX_BATCH_SIZE = 50` trong game-sync                                 |
| playedAt format     | ISO8601 strict (`@IsISO8601`)                                           | ISO8601 string                                                        |
| metadata limits     | max 10 keys, 2048 bytes (`@IsValidMetadata`)                            | Documented trong `documents/modules/game-result-sync.md`              |
