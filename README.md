# Game API

Backend API for hyper-casual / casual mobile games. **Leaderboard-as-a-Service** for guest-only players — no user accounts, no registration.

Players are identified by anonymous guest tokens. The server handles score storage, HMAC replay protection, and high-performance leaderboards across multiple games.

**Node.js:** `>= 20`

## Tech Stack

| Layer      | Technology                                              |
| ---------- | ------------------------------------------------------- |
| Framework  | NestJS 11                                               |
| ORM        | Prisma 6                                                |
| Database   | PostgreSQL 16 (partitioned results)                     |
| Cache      | Redis 8 (ioredis)                                       |
| Queue      | BullMQ (`rank-push-notification` — scheduled rank push) |
| Push       | firebase-admin (FCM)                                    |
| Validation | class-validator, class-transformer                      |
| Security   | helmet, compression                                     |
| Scheduler  | @nestjs/schedule                                        |
| Events     | @nestjs/event-emitter                                   |

## Quick Start

### 1. Start dependencies

```bash
docker-compose up -d
```

See [documents/setup/docker.md](./documents/setup/docker.md) for PostgreSQL and Redis connection details.

### 2. Configure environment

```bash
cp .env.example .env
```

Required variables:

```env
DATABASE_URL="postgresql://kwong2000:1234abcd@localhost:5432/game-api"
REDIS_URL="redis://localhost:6379"
PORT=3000
NODE_ENV="development"

# Optional — push notifications (FCM)
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
```

Push is optional: server starts without Firebase; device APIs still work. See [documents/setup/environment-variables.md](./documents/setup/environment-variables.md) for full details.

### 3. Install and migrate

```bash
npm install
npm run prisma:migrate
```

> `game_results` uses PostgreSQL range partitioning via a custom SQL migration. See [GAME_API_BUILD_SPEC.md](./GAME_API_BUILD_SPEC.md) Section 5 if you need to apply partition migrations manually.

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

| Method | Path                   | Auth   | Description                       |
| ------ | ---------------------- | ------ | --------------------------------- |
| GET    | `/health`              | Public | Health check (Postgres + Redis)   |
| POST   | `/guest/init`          | Public | Create guest, receive token       |
| PATCH  | `/guest/name`          | Bearer | Update display name               |
| POST   | `/results`             | Bearer | Submit game results (batch)       |
| GET    | `/leaderboards`        | Public | Paginated leaderboard             |
| POST   | `/devices`             | Bearer | Register FCM device token         |
| PATCH  | `/devices`             | Bearer | Update FCM token / locale         |
| DELETE | `/devices`             | Bearer | Unregister device token           |
| PATCH  | `/devices/preferences` | Bearer | Enable/disable push notifications |

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
│   │   ├── leaderboard/           # Leaderboard query + rank tracker
│   │   └── notifications/         # FCM inline + Saturday BullMQ batch
│   ├── infra/
│   │   ├── prisma/
│   │   ├── redis/
│   │   └── maintenance/           # Partition cron job
│   └── domain/
│       └── events/                # Top 100 domain events
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── documents/                     # API, setup, and schedule docs
├── docker-compose.yml
└── GAME_API_BUILD_SPEC.md         # Full build specification
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

### HMAC replay protection

Each result item includes an HMAC-SHA256 signature:

```ts
const payload = `${gameId}|${guestId}|${clientResultId}|${score}|${playedAt || ''}`;
const signature = createHmac('sha256', replaySecret).update(payload).digest('hex');
```

`replaySecret` is configured per game in `src/common/constants/game.constants.ts`.

### Leaderboard

- Đọc trực tiếp PostgreSQL `leaderboards` (ORDER BY `bestScore` DESC)
- Không cache Redis sorted set

### Result deduplication

- `game_results` is partitioned by `createdAt` — no global unique constraint on `clientResultId`
- Dedup uses Postgres advisory locks per `(gameId, guestId, clientResultId)` in a transaction

### Scheduled maintenance

- `MaintenanceService` creates `game_results_<YYYY>` partition for the next calendar year
- Cron: `0 3 1 * *` (3:00 AM on the 1st of each month) + startup check

See [documents/schedule/game-results-partition.md](./documents/schedule/game-results-partition.md).

### Push notifications

- Device fields are stored on `guest_players` (`fcmToken`, `devicePlatform`, `notificationLocale`)
- `POST /api/devices` — client registers FCM token after guest init
- **Top 100**: Rank tracker events → `NotificationDeliveryService` gửi FCM **inline** (`top_100_entered` / `top_100_exited`)
- **Scheduled rank push**: Cron per-game `GAME_CONFIG.rankPushCron` → BullMQ batch → FCM inline (`rank_push`); chỉ guest có token và có rank
- FCM payload `data`: `{ type, route }` — client dùng in-app navigation, không phải deeplink URL
- Missing `FIREBASE_*` → push disabled; device APIs vẫn hoạt động

Client setup: [game-starter-kit/documents/setup/firebase-native.md](../game-starter-kit/documents/setup/firebase-native.md).

## Supported Games

Games are declared in source code (`GameId` enum), not in a database table.

| Game ID   | Rank push cron (`rankPushCron`) |
| --------- | ------------------------------- |
| `FRULOOP` | `0 9 * * 6` (9:00 Thứ 7, VN TZ) |

To add a new game, update `GAME_CONFIG` in `src/common/constants/game.constants.ts`. See [GAME_API_BUILD_SPEC.md](./documents/GAME_API_BUILD_SPEC.md).

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
| Full build spec       | [GAME_API_BUILD_SPEC.md](./GAME_API_BUILD_SPEC.md)                                             |
| Architecture overview | [documents/architecture/overview.md](./documents/architecture/overview.md)                     |
| Database schema       | [documents/architecture/database-schema.md](./documents/architecture/database-schema.md)       |
| Push notifications    | [documents/architecture/notifications.md](./documents/architecture/notifications.md)           |
| Local development     | [documents/setup/local-development.md](./documents/setup/local-development.md)                 |
| Production deployment | [documents/setup/production-deployment.md](./documents/setup/production-deployment.md)         |
| Adding a new game     | [documents/setup/adding-new-game.md](./documents/setup/adding-new-game.md)                     |
| Docker setup          | [documents/setup/docker.md](./documents/setup/docker.md)                                       |
| Environment variables | [documents/setup/environment-variables.md](./documents/setup/environment-variables.md)         |
| Devices / push tokens | [documents/apis/devices.md](./documents/apis/devices.md)                                       |
| Partition maintenance | [documents/schedule/game-results-partition.md](./documents/schedule/game-results-partition.md) |
| FCM scheduled jobs    | [documents/schedule/fcm-notification-jobs.md](./documents/schedule/fcm-notification-jobs.md)   |

## Related Projects

- [game-starter-kit](../game-starter-kit/) — Phaser 3 + Capacitor client (`guest`, `game-sync`, `leaderboard`, `notifications` modules).

## License

Private — internal studio use.
