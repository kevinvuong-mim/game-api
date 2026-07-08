# Database Schema

Schema Prisma: `prisma/schema.prisma`. Database: PostgreSQL 16.

## Enum

| Enum | Giá trị | Dùng cho |
| ---- | ------- | -------- |
| `GameId` | `FRULOOP` | Mọi bảng theo game |
| `DevicePlatform` | `IOS`, `ANDROID` | FCM device token |
| `DeviceTokenStatus` | `ACTIVE`, `INVALID`, `INACTIVE` | Trạng thái token |
| `NotificationLocale` | `EN`, `VI` | Ngôn ngữ push |
| `NotificationOutboxStatus` | `PENDING`, `PROCESSING`, `SENT`, `SKIPPED`, `DEAD` | Outbox delivery |

> Khi thêm game mới: cập nhật `GameId` trong `schema.prisma` **và** `game.constants.ts`, rồi chạy migration.

## Bảng `guest_players`

Lưu identity guest ẩn danh.

| Cột | Kiểu | Mô tả |
| --- | ---- | ----- |
| `id` | UUID PK | `guestId` trả về client |
| `gameId` | `GameId` | Game gắn với guest |
| `name` | `String?` | Tên hiển thị leaderboard (optional) |
| `secretTokenHash` | `String` UNIQUE | SHA-256 của `secretToken` |
| `inTop100` | `Boolean` | Cache trạng thái Top 100 (notification) |
| `createdAt` | `DateTime` | Thời điểm tạo |

**Constraints:**

- `@@unique([gameId, id])` — composite FK target cho các bảng con
- `@@unique([secretTokenHash])` — lookup auth

**Quan hệ:** `gameResults[]`, `leaderboards?`, `deviceToken?`

## Bảng `game_results` (partitioned)

Lưu từng lần chơi. **Partition theo `createdAt`** (range theo năm).

| Cột | Kiểu | Mô tả |
| --- | ---- | ----- |
| `id` | UUID | ID nội bộ |
| `createdAt` | `DateTime` | Partition key + part of PK |
| `gameId` | `GameId` | |
| `guestId` | UUID | FK → `guest_players` |
| `clientResultId` | `String` | ID client tạo (dedup key) |
| `score` | `Int` | Điểm lần chơi |
| `replayHash` | `String` | HMAC signature đã verify |
| `metadata` | `Json?` | Metadata flat (max 10 keys) |
| `playedAt` | `DateTime?` | Thời điểm chơi từ client |

**Primary key:** `@@id([id, createdAt])` — bắt buộc chứa partition key.

**Indexes:**

- `[gameId, guestId, clientResultId]` — dedup lookup
- `[gameId, guestId]`
- `[gameId, createdAt]`

**Partition con:** `game_results_2026`, `game_results_2027`, … — tạo bởi migration ban đầu + `MaintenanceService`. Xem [schedule/game-results-partition.md](../schedule/game-results-partition.md).

**Lưu ý:** Không có `UNIQUE (gameId, guestId, clientResultId)` toàn cục vì PostgreSQL yêu cầu UNIQUE trên partitioned table phải chứa partition key. Dedup dùng advisory lock trong transaction.

## Bảng `leaderboards`

Best score mỗi guest — nguồn truth cho ranking.

| Cột | Kiểu | Mô tả |
| --- | ---- | ----- |
| `gameId` | `GameId` | Part of PK |
| `guestId` | UUID | Part of PK, FK → `guest_players` |
| `bestScore` | `Int` | Điểm cao nhất |
| `updatedAt` | `DateTime` | Lần cập nhật gần nhất |

**Primary key:** `@@id([gameId, guestId])`

**Index:** `[gameId, bestScore DESC]` — query rank, rebuild Redis cache.

Upsert sau submit: `GREATEST(existing, newScore)` — chỉ tăng khi điểm mới cao hơn.

## Bảng `guest_device_tokens`

FCM registration token — tối đa **một** active token mỗi guest mỗi game.

| Cột | Kiểu | Mô tả |
| --- | ---- | ----- |
| `id` | UUID PK | |
| `gameId` | `GameId` | |
| `guestId` | UUID | FK → `guest_players` |
| `token` | `String` UNIQUE | FCM token |
| `platform` | `DevicePlatform` | |
| `locale` | `NotificationLocale` | `EN` / `VI` |
| `status` | `DeviceTokenStatus` | `ACTIVE` / `INVALID` / `INACTIVE` |
| `lastSeenAt` | `DateTime` | Heartbeat |
| `createdAt`, `updatedAt` | `DateTime` | |

**Constraints:**

- `@@unique([gameId, guestId])` — một record per guest per game
- `token` UNIQUE — token conflict → deactivate record cũ của guest khác

## Bảng `notification_outbox`

Transactional outbox cho FCM delivery — đảm bảo at-least-once với retry.

| Cột | Kiểu | Mô tả |
| --- | ---- | ----- |
| `id` | UUID PK | |
| `gameId` | `GameId` | |
| `guestId` | UUID | |
| `type` | `String` | `top_100_entered`, `top_100_exited`, `saturday_rank` |
| `route` | `String` | In-app route (`Leaderboard`, …) |
| `params` | `Json?` | Ví dụ `{ "rank": 42 }` |
| `locale` | `NotificationLocale?` | Override locale |
| `status` | `NotificationOutboxStatus` | Lifecycle |
| `attempts` | `Int` | Số lần thử gửi |
| `maxAttempts` | `Int` | Mặc định 5 |
| `lastError` | `String?` | Lỗi gần nhất |
| `idempotencyKey` | `String?` UNIQUE | Dedup (Saturday rank theo tuần) |
| `scheduledAt` | `DateTime` | Thời điểm retry tiếp theo |
| `sentAt` | `DateTime?` | |
| `createdAt`, `updatedAt` | `DateTime` | |

**Status flow:**

```
PENDING → PROCESSING → SENT
                    → SKIPPED (muted / no token / invalid token)
                    → PENDING (retry với backoff)
                    → DEAD (max attempts)
```

## ER diagram

```mermaid
erDiagram
    guest_players ||--o{ game_results : has
    guest_players ||--o| leaderboards : has
    guest_players ||--o| guest_device_tokens : has

    guest_players {
        uuid id PK
        GameId gameId
        string name
        string secretTokenHash UK
        boolean inTop100
    }

    game_results {
        uuid id
        datetime createdAt PK
        GameId gameId
        uuid guestId FK
        string clientResultId
        int score
    }

    leaderboards {
        GameId gameId PK
        uuid guestId PK_FK
        int bestScore
    }

    guest_device_tokens {
        uuid id PK
        GameId gameId
        uuid guestId FK
        string token UK
        DeviceTokenStatus status
    }

    notification_outbox {
        uuid id PK
        GameId gameId
        uuid guestId
        string type
        NotificationOutboxStatus status
    }
```

## Migrations

```bash
npm run prisma:migrate    # dev: tạo + apply migration
npm run prisma:generate   # sinh Prisma client
npm run prisma:reset      # reset DB (dev only)
```

Migration partition `game_results` dùng custom SQL (`prisma/migrations/..._partition_game_results/`). Prisma không hỗ trợ declarative partitioning — không regenerate migration này bằng `prisma migrate` thông thường.

## Truy vấn hữu ích (debug)

```sql
-- Top 10 leaderboard
SELECT "guestId", "bestScore"
FROM leaderboards
WHERE "gameId" = 'FRULOOP'
ORDER BY "bestScore" DESC
LIMIT 10;

-- Active device tokens
SELECT "guestId", platform, locale, status
FROM guest_device_tokens
WHERE "gameId" = 'FRULOOP' AND status = 'ACTIVE';

-- Pending notifications
SELECT id, type, status, attempts, "lastError"
FROM notification_outbox
WHERE status IN ('PENDING', 'PROCESSING')
ORDER BY "scheduledAt";

-- Partitions
SELECT relname FROM pg_class WHERE relname LIKE 'game_results_%';
```
