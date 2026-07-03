# BUILD SPEC — "Leaderboard-as-a-Service" Backend cho game guest-only

---

# 0. Mục tiêu

Xây dựng backend API cho game casual / hyper-casual.

Người chơi không đăng ký tài khoản, chỉ chơi dưới dạng guest.

Server đảm nhiệm:

- Lưu điểm số.
- Chống gian lận bằng HMAC (tập trung ở lớp chữ ký kết quả chơi, không phải xác thực người dùng).
- Cung cấp leaderboard hiệu năng cao (hỗ trợ nhiều game độc lập).
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

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  enableImplicitConversion: true,
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

| Mã  | Ý nghĩa                     |
| --- | --------------------------- |
| 200 | Thành công                  |
| 201 | Tạo mới thành công          |
| 400 | Validation lỗi              |
| 401 | Token không hợp lệ          |
| 404 | gameId không tồn tại        |
| 409 | Xung đột                    |
| 429 | Rate limit                  |
| 503 | DB hoặc Redis không kết nối |
| 500 | Lỗi nội bộ                  |

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
      index.ts

    utils/
      crypto.util.ts
      game.util.ts
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
      dto/
        leaderboard-query.dto.ts

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
    game.md
    guest.md
    leaderboard.md
    health-check.md
  schedule/
    game-results-partition-maintenance.md
  setup/
    docker.md
    environment-variables.md

prisma/
  schema.prisma
  migrations/

docker-compose.yml
.env
.env.example
```

---

# 3. Game Config

`replaySecret` phải là SHA256 hex (64 ký tự), tối thiểu 32 bytes entropy, và được inject qua environment variable — KHÔNG hardcode giá trị thật trong source.

```ts
// src/common/constants/game.constants.ts

export enum GameId {
  FRULOOP = 'FRULOOP',
}

export const GAME_CONFIG: Record<GameId, { name: string; replaySecret: string }> = {
  [GameId.FRULOOP]: {
    name: 'Fruloop',
    replaySecret: process.env.REPLAY_SECRET_FRULOOP ?? '',
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

Chạy khi app khởi động, kiểm tra tất cả entries trong `GAME_CONFIG`:

- Secret tồn tại và không rỗng
- Đúng định dạng SHA256 hex (64 ký tự lowercase)
- Đủ entropy (tối thiểu 32 bytes = 64 hex chars)

Sai → throw Error → app không khởi động.

```text
Lý do: fail-fast tốt hơn runtime error khi game đầu tiên submit kết quả.
```

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
  id              String   @default(uuid())
  gameId          GameId
  name            String?
  secretTokenHash String
  createdAt       DateTime @default(now())

  gameResults  GameResult[]
  leaderboards Leaderboard?

  @@id([id])
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
```

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
prisma migrate resolve --applied XXXXXX_partition_game_results
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

- Chạy ngày 1 mỗi tháng (`PARTITION_CRON`)
- Logic: kiểm tra xem partition cho **năm tiếp theo** đã tồn tại chưa
- Nếu chưa có → tạo mới bằng `prisma.$executeRawUnsafe`
- Nếu đã có → skip (idempotent)

ENV:

```env
PARTITION_CRON="0 3 1 * *"
```

---

# 6. Endpoints

## Auth

Header:

```text
Authorization: Bearer <secretToken>
```

Server flow:

```text
sha256(token)
→ check Redis cache (TTL 5 phút)
→ nếu miss: query DB, cache kết quả
→ so sánh với secretTokenHash trong DB
→ attach guest vào request
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

Response:

```json
{
  "guestId": "uuid",
  "gameId": "FRULOOP",
  "secretToken": "raw-token-plain-text"
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

Response: guest object đã update.

---

## POST /api/games/:gameId/results

Auth: Bearer token required

Rate limit: `20 / 60s` per guest

Body:

```json
{
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

### HMAC Verification

Payload phải khớp chính xác với client:

```ts
const payload = `${gameId}|${guestId}|${clientResultId}|${score}|${playedAt || ''}`;

const expected = computeReplaySignature(replaySecret, payload);
// so sánh bằng timingSafeEqual
```

### Flow

1. Validate `gameId` và body
2. Xác thực Bearer token
3. Verify signature từng item (skip item invalid, không fail toàn batch)
4. Với từng item hợp lệ, dedup + insert **atomic** theo cơ chế advisory lock ở Section 5
   (mỗi item 1 transaction: `pg_advisory_xact_lock` theo `(gameId, guestId, clientResultId)`
   → check tồn tại → skip nếu đã có, insert nếu chưa có)
5. Upsert leaderboard: chỉ update `bestScore` nếu `score > bestScore` hiện tại
6. Update Redis sorted set nếu score mới là best score của player

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

Response:

```json
{
  "success": true,
  "insertedCount": 2,
  "message": "Results submitted"
}
```

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

Response:

```json
{
  "gameId": "FRULOOP",
  "total": 150,
  "page": 1,
  "limit": 20,
  "items": [{ "rank": 1, "guestId": "uuid", "name": "PlayerOne", "bestScore": 9999 }],
  "self": {
    "rank": 12,
    "bestScore": 5000
  }
}
```

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

# 7. Redis

```text
Auth token cache:
Key:   auth:token:{sha256Hash}
Value: JSON string { "guestId": "...", "gameId": "..." }
TTL:   5 phút (300s)
Lý do: tránh query DB mỗi request trên hot path POST /results

> Value phải chứa cả `gameId`, không chỉ `guestId` — route như
> `POST /games/:gameId/results` cần đối chiếu `gameId` của guest đã
> xác thực với `gameId` trên URL. Nếu cache chỉ lưu `guestId`, cache
> hit sẽ không có đủ dữ liệu để attach `request.user` đúng như Section 12.

Leaderboard cache:
Key:    leaderboard:{gameId}
Member: guestId
Score:  bestScore
TTL:    không đặt (persistent trong Redis)
Max:    LEADERBOARD_CACHE_MAX=1000 entries
```

Khi update leaderboard sau POST /results:

```text
ZADD leaderboard:{gameId} {bestScore} {guestId}
ZREMRANGEBYRANK leaderboard:{gameId} 0 -(LEADERBOARD_CACHE_MAX+1)
```

---

# 8. HMAC Anti-cheat

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

Implement bằng Redis sorted set hoặc sliding window counter.

| Endpoint          | Limit | Window | Redis Key prefix    |
| ----------------- | ----: | -----: | ------------------- |
| POST /guest/init  |     5 |    60s | rate:init:{ip}      |
| PATCH /guest/name |    10 |    60s | rate:name:{guest}   |
| POST /results     |    20 |    60s | rate:result:{guest} |
| GET /leaderboards |    30 |    60s | rate:lb:{ip}        |

Vượt → `429 Too Many Requests`

---

# 10. Partition Maintenance

Cron schedule (từ `PARTITION_CRON` env):

```text
Mặc định: 0 3 1 * * (3:00 sáng ngày 1 mỗi tháng)
```

Logic:

```ts
// Kiểm tra partition cho năm tiếp theo
const nextYear = new Date().getFullYear() + 1;
const tableName = `game_results_${nextYear}`;

// Kiểm tra tồn tại
const exists = await prisma.$queryRaw`
  SELECT 1 FROM pg_class WHERE relname = ${tableName}
`;

if (!exists.length) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE ${tableName}
    PARTITION OF game_results
    FOR VALUES FROM ('${nextYear}-01-01')
    TO ('${nextYear + 1}-01-01')
  `);
}
```

> `MaintenanceService` cũng gọi `ensureNextYearPartition()` trong `onModuleInit()` để đảm bảo partition tồn tại ngay khi app khởi động (bổ sung cho cron hàng tháng).

---

# 11. Startup Guard

Chạy trong `OnModuleInit` của `AppModule` hoặc trước `app.listen()` trong `main.ts`.

```ts
function validateGameSecrets(): void {
  for (const [gameId, config] of Object.entries(GAME_CONFIG)) {
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
> cho các route cần đối chiếu `gameId` (ví dụ `POST /games/:gameId/results`).

Decorator:

```ts
@Guest()   // inject current guest từ request
```

---

# 13. Crypto Utils

```ts
// Tạo raw token (URL-safe base64, 32 bytes entropy)
generateSecretToken(): string

// SHA256 hex của token
hashSecretToken(token: string): string

// Timing-safe compare
timingSafeCompare(a: string, b: string): boolean

// HMAC-SHA256 hex
computeReplaySignature(secret: string, payload: string): string

// Verify HMAC replay signature (timing-safe hex compare)
verifyReplaySignature(secret: string, payload: string, received: string): boolean

// Validate định dạng SHA256 hex (64 ký tự, lowercase a-f0-9)
isValidSha256Hex(value: string): boolean

// Hash 64-bit ổn định từ (gameId, guestId, clientResultId), dùng làm
// key cho pg_advisory_xact_lock khi dedup insert game_results (xem Section 5)
dedupLockKey(gameId: string, guestId: string, clientResultId: string): bigint
```

---

# 14. Environment Variables

```env
DATABASE_URL="postgresql://kwong2000:1234abcd@localhost:5432/game-api"

REDIS_URL=redis://localhost:6379

PORT=3000

NODE_ENV=development

# CORS: production nên set domain cụ thể, không dùng *
CORS_ORIGIN=http://localhost:5173

# Rate limits (requests / 60s)
RATE_LIMIT_INIT=5
RATE_LIMIT_NAME=10
RATE_LIMIT_RESULT=20
RATE_LIMIT_LEADERBOARD=30

# Redis leaderboard
LEADERBOARD_CACHE_MAX=1000

# Redis auth token cache TTL (giây)
AUTH_TOKEN_CACHE_TTL=300

# Partition cron
PARTITION_CRON="0 3 1 * *"

# Replay secrets — một biến per game, không commit giá trị thật
# Format: SHA256 hex (64 ký tự)
REPLAY_SECRET_FRULOOP=
```

> **Khi thêm game mới:** Thêm `REPLAY_SECRET_<GAME_ID>=` vào `.env.example` và CI/CD secrets.

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

  "lint": "eslint \"src/**/*.ts\" --fix",
  "format": "prettier --write \"src/**/*.ts\""
}
```

---

# 16. Quy trình triển khai

```bash
npm install

docker-compose up -d

npm run prisma:migrate
# Sau đó apply custom partition migration thủ công (xem Section 5)

npm run start:dev

# Production
npm run build
npm run start:prod
```

### Thêm game mới

1. Sửa `GameId` enum (trong source và schema Prisma)
2. Sửa `GAME_CONFIG` (thêm entry mới)
3. Thêm `REPLAY_SECRET_<GAME_ID>` vào `.env` và CI/CD secrets
4. Run `prisma migrate dev` (sync enum PostgreSQL)
5. Deploy backend và frontend cùng lúc (secret phải khớp)

### Rotate secret

```text
Phải release cùng lúc backend + client (coordinated deploy)
Trong cửa sổ rotate: signature cũ sẽ invalid → kết quả pending trên client bị từ chối
Nên rotate khi traffic thấp
```

---

# 17. Logging & Monitoring

- NestJS Logger (mỗi module dùng riêng)
- Request logging (method, path, status, duration)
- Stack trace chỉ log trong `NODE_ENV !== 'production'`
- **Không bao giờ log:** `replaySecret`, `secretToken` (raw), `secretTokenHash`
- Tích hợp Sentry hoặc Datadog (optional, qua ENV)
- `/api/metrics` endpoint (optional, Prometheus format)

---

# 18. CORS

```ts
app.enableCors({
  origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:5173',
  credentials: true,
});
```

> Production: set `CORS_ORIGIN` thành domain cụ thể (ví dụ: `https://game.example.com`). Không dùng `*` khi có credentials.

---

# 19. Bảo mật bổ sung

- `helmet` — security headers
- `compression` — gzip responses
- Không expose stack trace ở production
- Không log `replaySecret` hoặc `secretToken` raw
- Rate limit bảo vệ tất cả endpoints
- `timingSafeEqual` cho mọi so sánh secret
- `CORS_ORIGIN` phải được set cụ thể ở production (không dùng `*`)
- Startup Guard chặn app khởi động nếu secret sai format

---

# 20. Trade-off

| Ưu điểm                        | Nhược điểm                                     |
| ------------------------------ | ---------------------------------------------- |
| Không cần bảng games           | Thêm game phải deploy lại                      |
| Verify HMAC nhanh              | Secret nằm trong client (env, không hardcode)  |
| Redis cache nhanh              | Redis mất data khi restart → cần rebuild logic |
| Partition tối ưu write/archive | Custom migration, Prisma không support native  |
| Token cache Redis              | Cache TTL 5 phút → token revoke không tức thì  |
| Leaderboard upsert idempotent  | GREATEST() chỉ update khi score cao hơn        |
| Token vĩnh viễn, đơn giản      | Uninstall/clear data = mất data, không relink  |
| Behavior đồng nhất iOS/Android | Guest mới sau mỗi lần cài app                  |

---

# 21. Đồng bộ với game-starter-kit (frontend)

| Điểm đồng bộ        | Backend                                                                 | Frontend (game-starter-kit)                                 |
| ------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| GameId              | `GameId` enum trong `game.constants.ts`                                 | `gameConfig.id` trong `src/game/config.ts`                  |
| replaySecret        | `REPLAY_SECRET_<GAME_ID>` env var                                       | `VITE_REPLAY_SECRET` env var                                |
| HMAC payload        | `${gameId}\|${guestId}\|${clientResultId}\|${score}\|${playedAt\|\|''}` | Idem                                                        |
| API base URL        | Global prefix `/api`, PORT=3000                                         | `VITE_API_URL=http://localhost:3000/api`                    |
| Response envelope   | `{ success, statusCode, message, data, path, timestamp }`               | `ApiClient` envelope type                                   |
| Auth header         | `Authorization: Bearer <secretToken>`                                   | `ApiClient.setAuthToken(secretToken)`                       |
| Token persistence   | Không TTL, không rotate, vĩnh viễn                                      | Lưu trong Capacitor Preferences `gsk:guest`, đọc khi app mở |
| deviceId            | Không nhận trong body                                                   | Không gửi lên server                                        |
| Guest init behavior | Mỗi lần gọi = tạo guest mới                                             | Chỉ gọi khi `gsk:guest` chưa có trong storage               |
| Batch limits        | 50 items per request (validate trong DTO)                               | `MAX_BATCH_SIZE = 50` trong game-sync                       |
| playedAt format     | ISO8601 (`DateTime` Prisma)                                             | ISO8601 string                                              |
| metadata limits     | max 10 keys, 2048 bytes (validate DTO)                                  | Documented trong game-sync spec                             |
