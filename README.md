# game-api

Leaderboard-as-a-Service backend for guest-only casual games. See `GAME_API_BUILD_SPEC.md` for the full contract.

## Stack

- NestJS 11, Prisma 6, PostgreSQL 16, Redis 8
- Games declared in source (`GameId` enum + `REPLAY_SECRET_*` env vars)
- Bearer `secretToken` guest auth, HMAC result signatures

## Endpoints

Base: `http://localhost:3000/api`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | DB + Redis status (503 if degraded) |
| `POST` | `/guest/init` | — | Create guest `{ gameId }` → `{ guestId, gameId, secretToken }` |
| `PATCH` | `/guest/name` | Bearer | Update display name `{ name }` |
| `POST` | `/games/:gameId/results` | Bearer | Submit batch `{ items: [{ clientResultId, score, playedAt?, metadata?, signature }] }` |
| `GET` | `/leaderboards` | — | `?gameId=&page=&limit=&guestId=` |

## Quick start

```bash
cp .env.example .env
# Set REPLAY_SECRET_FRULOOP (64-char hex each)

docker-compose up -d
npm install
npm run prisma:migrate
npm run start:dev
```

## Env

See `.env.example` — required: `DATABASE_URL`, `REDIS_URL`, `REPLAY_SECRET_FRULOOP`.

## Frontend sync

Companion client: `game-starter-kit` — `gameConfig.id` = `FRULOOP`, `VITE_REPLAY_SECRET` must match backend secret.
