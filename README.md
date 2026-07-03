# Game API

Backend API for hyper-casual / casual mobile games. **Leaderboard-as-a-Service** for guest-only players — no user accounts, no registration.

Players are identified by anonymous guest tokens. The server handles score storage, HMAC replay protection, and high-performance leaderboards across multiple games.

**Node.js:** `>= 20`

## Tech Stack

| Layer      | Technology                          |
| ---------- | ----------------------------------- |
| Framework  | NestJS 11                           |
| ORM        | Prisma 6                            |
| Database   | PostgreSQL 16 (partitioned results) |
| Cache      | Redis 8 (ioredis)                   |
| Validation | class-validator, class-transformer  |
| Security   | helmet, compression                 |
| Scheduler  | @nestjs/schedule                    |

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
```

See [documents/setup/environment-variables.md](./documents/setup/environment-variables.md) for full details.

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

| Method | Path            | Auth   | Description                     |
| ------ | --------------- | ------ | ------------------------------- |
| GET    | `/health`       | Public | Health check (Postgres + Redis) |
| POST   | `/guest/init`   | Public | Create guest, receive token     |
| PATCH  | `/guest/name`   | Bearer | Update display name             |
| POST   | `/results`      | Bearer | Submit game results (batch)     |
| GET    | `/leaderboards` | Public | Paginated leaderboard           |

Detailed API docs:

| Endpoint     | Documentation                                                      |
| ------------ | ------------------------------------------------------------------ |
| Health check | [documents/apis/health-check.md](./documents/apis/health-check.md) |
| Guest        | [documents/apis/guest.md](./documents/apis/guest.md)               |
| Results      | [documents/apis/results.md](./documents/apis/results.md)           |
| Leaderboard  | [documents/apis/leaderboard.md](./documents/apis/leaderboard.md)   |

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
│   └── modules/
│       ├── guest/                 # Guest init + name
│       ├── results/               # Result submission + dedup
│       ├── leaderboard/           # Leaderboard query (Redis + DB fallback)
│       ├── maintenance/           # Partition cron job
│       ├── redis/
│       └── prisma/
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

### Leaderboard cache

- Redis sorted set: `leaderboard:{gameId}`
- Cold start rebuilds top 1000 entries from PostgreSQL
- Falls back to DB when Redis is unavailable

### Result deduplication

- `game_results` is partitioned by `createdAt` — no global unique constraint on `clientResultId`
- Dedup uses Postgres advisory locks per `(gameId, guestId, clientResultId)` in a transaction

### Scheduled maintenance

- `MaintenanceService` creates `game_results_<YYYY>` partition for the next calendar year
- Cron: `0 3 1 * *` (3:00 AM on the 1st of each month) + startup check

See [documents/schedule/game-results-partition.md](./documents/schedule/game-results-partition.md).

## Supported Games

Games are declared in source code (`GameId` enum), not in a database table.

| Game ID   | Name    |
| --------- | ------- |
| `FRULOOP` | Fruloop |

To add a new game, update `GAME_CONFIG` in `src/common/constants/game.constants.ts` and add a matching `replaySecret` (64-char hex). See [GAME_API_BUILD_SPEC.md](./GAME_API_BUILD_SPEC.md).

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
| Docker setup          | [documents/setup/docker.md](./documents/setup/docker.md)                                       |
| Environment variables | [documents/setup/environment-variables.md](./documents/setup/environment-variables.md)         |
| Partition maintenance | [documents/schedule/game-results-partition.md](./documents/schedule/game-results-partition.md) |

## Related Projects

- [game-starter-kit](../game-starter-kit/) — Phaser 3 + Capacitor client that integrates with this API (`guest`, `game-sync`, `leaderboard` modules).

## License

Private — internal studio use.
