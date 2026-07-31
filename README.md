# Game API

Backend API for hyper-casual / casual mobile games. **Leaderboard-as-a-Service** for guest-only players — no user accounts, no registration.

Players are identified by anonymous guest tokens. The server handles score storage, HMAC verification, result-ID deduplication, and PostgreSQL leaderboards across multiple games.

**Node.js:** `>= 20`

## Tech Stack

| Layer      | Technology                                              |
| ---------- | ------------------------------------------------------- |
| Framework  | NestJS 11                                               |
| ORM        | Prisma 6                                                |
| Database   | PostgreSQL 16 (partitioned results)                     |
| Cache      | Redis 8.6 dev image (ioredis)                           |
| Queue      | BullMQ (`rank-push-notification` — scheduled rank push) |
| Push       | firebase-admin (FCM)                                    |
| Validation | class-validator, class-transformer                      |
| Security   | helmet, compression                                     |
| Scheduler  | @nestjs/schedule                                        |

## Quick Start

### 1. Start dependencies

```bash
docker-compose up -d
```

See [documents/setup/local-development.md](./documents/setup/local-development.md) for PostgreSQL and Redis connection details.

### 2. Configure environment

```bash
cp .env.example .env
```

Copy values from [`.env.example`](./.env.example) (dev credentials for local Postgres/Redis). Full reference: [documents/setup/environment-variables.md](./documents/setup/environment-variables.md).

Push is optional: server starts without Firebase; device APIs still work.

### 3. Install and migrate

```bash
npm install
npm run prisma:migrate
```

> `game_results` uses PostgreSQL range partitioning via a custom SQL migration. See [documents/schedule/game-results-partition.md](./documents/schedule/game-results-partition.md).

### 4. Run the server

```bash
npm run start:dev
```

API base URL: `http://localhost:3000/api`

Verify health:

```bash
curl http://localhost:3000/api/health
```

## API Endpoints

Global prefix: `/api`

| Method | Path            | Auth   | Description                     |
| ------ | --------------- | ------ | ------------------------------- |
| GET    | `/health`       | Public | Health check (Postgres + Redis) |
| POST   | `/guest/init`   | Public | Create guest, receive token     |
| PATCH  | `/guest/name`   | Bearer | Update display name             |
| POST   | `/results`      | Bearer | Submit game results (batch)     |
| GET    | `/leaderboards` | Public | Paginated leaderboard           |
| POST   | `/devices`      | Bearer | Register FCM device token       |
| PATCH  | `/devices`      | Bearer | Update FCM token / locale       |
| DELETE | `/devices`      | Bearer | Unregister FCM device token     |

Detailed API docs:

| Endpoint     | Documentation                                                      |
| ------------ | ------------------------------------------------------------------ |
| Health check | [documents/apis/health-check.md](./documents/apis/health-check.md) |
| Guest        | [documents/apis/guest.md](./documents/apis/guest.md)               |
| Results      | [documents/apis/results.md](./documents/apis/results.md)           |
| Leaderboard  | [documents/apis/leaderboard.md](./documents/apis/leaderboard.md)   |
| Devices      | [documents/apis/devices.md](./documents/apis/devices.md)           |

## Project Structure

```
game-api/
├── src/
│   ├── main.ts                    # Bootstrap, global prefix, pipes/filters
│   ├── app.module.ts
│   ├── app.controller.ts          # GET /api/health
│   ├── common/
│   │   ├── constants/             # GameId, rate limits, cron
│   │   ├── decorators/            # @Guest, @RateLimit
│   │   ├── filters/               # HttpExceptionFilter
│   │   ├── guards/                # GuestAuthGuard, RateLimitGuard
│   │   ├── interceptors/          # ResponseInterceptor (standard envelope)
│   │   ├── utils/                 # HMAC, token hashing
│   │   └── validators/
│   ├── features/
│   │   ├── guest/                 # Guest init + name
│   │   ├── results/               # Result submission + dedup
│   │   │   └── results-data.module.ts  # Shared ResultsRepository
│   │   ├── leaderboard/           # Leaderboard query + rank resolver
│   │   └── notifications/         # FCM + per-game scheduled BullMQ batches
│   ├── infra/
│   │   ├── prisma/
│   │   ├── redis/
│   │   └── maintenance/           # Partition cron job
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── documents/                     # API, setup, architecture, schedule docs
└── docker-compose.yml
```

## Path Alias

| Alias | Path    |
| ----- | ------- |
| `@/*` | `src/*` |

## Architecture Highlights

### Guest authentication

- `POST /guest/init` returns a permanent `secretToken` (plain text, once).
- Server stores only SHA-256 hash. Subsequent requests use `Authorization: Bearer <token>`.
- Token cached in Redis (TTL 5 min) to avoid DB lookup on every request.

### HMAC verification and deduplication

Each result item includes an HMAC-SHA256 signature:

```ts
const payload = `${gameId}|${guestId}|${clientResultId}|${score}|${playedAt || ''}`;
const signature = createHmac('sha256', replaySecret).update(payload).digest('hex');
```

`replaySecret` is configured per game in `src/common/constants/game.constants.ts` and is also shipped to the game client. HMAC catches malformed or mismatched submissions but is not server-authoritative anti-cheat; replay of the same `clientResultId` is prevented separately by database deduplication.

### Leaderboard

- Query PostgreSQL `leaderboards` with `ORDER BY bestScore DESC, guestId ASC`
- Self / submit / FCM ranks use the same tie-break (`countBetterRanks`)
- No Redis sorted-set cache

### Result deduplication

- `game_results` is partitioned by `createdAt` — no global unique constraint on `clientResultId`
- Dedup uses Postgres advisory locks per `(gameId, guestId, clientResultId)` in a transaction

### Scheduled maintenance

- `PartitionService` ensures `game_results_<YYYY>` for the current and next process-local calendar years
- Triggers: startup, ensure-on-insert, and cron `59 23 28-31 * *` (handler acts only on the process-local last day of each month)

See [documents/schedule/game-results-partition.md](./documents/schedule/game-results-partition.md).

### Push notifications

- Device fields are stored on `guest_players` (`fcmToken`, `devicePlatform`, `notificationLocale`)
- `POST /api/devices` — client registers FCM token after guest init
- **Top 100 exit**: khi một guest từ ngoài đi vào Top 100 nhờ best score mới, guest #100 cũ bị đẩy xuống >100 nhận FCM qua async in-process event listener (`top_100_exited`). Tracker cũng bắt trường hợp submitter chuyển từ ≤100 xuống >100 giữa hai snapshot do cập nhật concurrent. Submit response không chờ delivery; không có push “entered Top 100”.
- **Scheduled rank push**: Cron per-game `GAME_CONFIG.rankPushCron` → BullMQ batch → FCM inline (`rank_push`); chỉ guest có token và có rank
- **Rank sau submit**: `POST /api/results` trả `rank`, `bestScore` khi guest có entry trên leaderboard
- FCM payload `data`: `{ type, route, ...params }` — ví dụ rank push có thêm `rank`; client dùng in-app navigation, không phải deeplink URL
- Rank-push BullMQ: week-key `jobId` dedupe + `attempts: 3` / exponential backoff (xem [fcm-notification-jobs.md](./documents/schedule/fcm-notification-jobs.md))
- Missing `FIREBASE_*` → push disabled; device APIs vẫn hoạt động

Client setup: [game-apps/documents/setup/firebase-native.md](../game-apps/documents/setup/firebase-native.md).

## Supported Games

Games are declared in source code (`GameId` enum), not in a database table.

| Game ID   | Rank push cron (`rankPushCron`) |
| --------- | ------------------------------- |
| `FRULOOP` | `0 9 * * 6` (9:00 Thứ 7, VN TZ) |

To add a new game, open **one PR on `game-api`** covering `GameId` + `GAME_CONFIG` + migrate, then update the client. See [documents/setup/adding-new-game.md](./documents/setup/adding-new-game.md).

## Response Envelope

All successful responses are wrapped by `ResponseInterceptor`:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {},
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/..."
}
```

Errors use `HttpExceptionFilter` with `success: false`.

## Scripts

| Command                   | Description                   |
| ------------------------- | ----------------------------- |
| `npm run start:dev`       | Dev server with hot-reload    |
| `npm run start:prod`      | Run compiled `dist/main`      |
| `npm run build`           | Compile TypeScript            |
| `npm run lint`            | ESLint with auto-fix          |
| `npm run format`          | Prettier write                |
| `npm run prisma:migrate`  | Run Prisma migrations (dev)   |
| `npm run prisma:generate` | Generate Prisma client        |
| `npm run prisma:reset`    | Reset database and re-migrate |

## Documentation

| Topic                 | Path                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Local development     | [documents/setup/local-development.md](./documents/setup/local-development.md)                 |
| Environment variables | [documents/setup/environment-variables.md](./documents/setup/environment-variables.md)         |
| Production deployment | [documents/setup/production-deployment.md](./documents/setup/production-deployment.md)         |
| Adding a new game     | [documents/setup/adding-new-game.md](./documents/setup/adding-new-game.md)                     |
| Database schema       | [documents/architecture/database-schema.md](./documents/architecture/database-schema.md)       |
| Redis keys            | [documents/architecture/redis-keys.md](./documents/architecture/redis-keys.md)                 |
| Partition maintenance | [documents/schedule/game-results-partition.md](./documents/schedule/game-results-partition.md) |
| FCM / push jobs       | [documents/schedule/fcm-notification-jobs.md](./documents/schedule/fcm-notification-jobs.md)   |
| Devices / push tokens | [documents/apis/devices.md](./documents/apis/devices.md)                                       |

## Related Projects

- [game-apps](../game-apps/) — Phaser 3 + Capacitor client (`guest`, `game-sync`, `leaderboard`, `notifications` modules).

## License

Private — internal studio use.
