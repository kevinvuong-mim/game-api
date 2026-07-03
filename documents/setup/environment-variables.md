# Environment variables

See `GAME_API_BUILD_SPEC.md` Section 14 and `.env.example`.

Required for startup:

- `DATABASE_URL`
- `REDIS_URL`
- `REPLAY_SECRET_FRULOOP` — 64-char lowercase SHA256 hex

Optional:

- `CORS_ORIGIN` (default `http://localhost:5173`)
- `RATE_LIMIT_*`, `LEADERBOARD_CACHE_MAX`, `AUTH_TOKEN_CACHE_TTL`, `PARTITION_CRON`
