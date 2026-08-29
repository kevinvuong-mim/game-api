# Database Schema

Schema Prisma: `prisma/schema.prisma`  
Database: PostgreSQL 16

## Enum

| Enum                 | Values              |
| -------------------- | ------------------- |
| `GameId`             | `FRULOOP`, `MEMORA` |
| `DevicePlatform`     | `IOS`, `ANDROID`    |
| `NotificationLocale` | `EN`, `VI`          |

## Tables

### `guest_players`

| Column               | Type                  | Notes                  |
| -------------------- | --------------------- | ---------------------- |
| `id`                 | `TEXT`                | PK                     |
| `gameId`             | `GameId`              | scope by game          |
| `name`               | `TEXT?`               | display name           |
| `authTokenHash`      | `TEXT`                | unique auth token hash |
| `fcmToken`           | `TEXT?`               | unique FCM token       |
| `devicePlatform`     | `DevicePlatform?`     | IOS/ANDROID            |
| `notificationLocale` | `NotificationLocale?` | EN/VI                  |
| `createdAt`          | `TIMESTAMP(3)`        | creation timestamp     |

Constraints:

- unique(`authTokenHash`)
- unique(`fcmToken`)
- unique(`gameId`, `id`) (FK target)

### `game_results` (range partitioned by year)

| Column           | Type            | Notes                            |
| ---------------- | --------------- | -------------------------------- |
| `id`             | `TEXT`          | part of PK                       |
| `createdAt`      | `TIMESTAMP(3)`  | part of PK + partition key       |
| `gameId`         | `GameId`        |                                  |
| `guestId`        | `TEXT`          | FK -> `guest_players(gameId,id)` |
| `clientResultId` | `TEXT`          | client dedup key                 |
| `score`          | `INTEGER`       |                                  |
| `metadata`       | `JSONB?`        | optional                         |
| `playedAt`       | `TIMESTAMP(3)?` | optional                         |

Indexes:

- (`gameId`, `guestId`, `clientResultId`)
- (`gameId`, `guestId`)
- (`gameId`, `createdAt`)

### `leaderboards`

| Column      | Type           | Notes                        |
| ----------- | -------------- | ---------------------------- |
| `gameId`    | `GameId`       | PK part                      |
| `guestId`   | `TEXT`         | PK part + FK                 |
| `bestScore` | `INTEGER`      |                              |
| `updatedAt` | `TIMESTAMP(3)` | updated by Prisma/raw upsert |

Index:

- (`gameId`, `bestScore` DESC)

## ER Diagram

```mermaid
erDiagram
  guest_players ||--o{ game_results : has
  guest_players ||--o| leaderboards : has
```

## Notes

- Chỉ có 3 bảng nghiệp vụ chính: `guest_players`, `game_results`, `leaderboards`.
- Không còn `guest_device_tokens` và `notification_outbox`.
- `game_results` partition tạo bằng custom SQL migration + maintenance job.
- `guest_players.@@unique([gameId, id])` tồn tại để làm target FK composite cho `game_results` / `leaderboards` (không thừa dù `id` đã là `@id`).
- Cả `game_results` và `leaderboards` dùng composite FK (`gameId`, `guestId`) tới `guest_players`; delete guest cascade sang hai bảng.
- `clientResultId` không có unique constraint toàn parent partition; service dùng advisory transaction lock rồi lookup để dedup theo (`gameId`, `guestId`, `clientResultId`).
