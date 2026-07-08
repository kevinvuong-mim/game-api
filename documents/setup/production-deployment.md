# Production Deployment

Hướng dẫn build và deploy `game-api` lên production. Dockerfile multi-stage có sẵn tại repo root.

## Yêu cầu production

| Thành phần | Ghi chú |
| ---------- | ------- |
| Node.js | ≥ 20 (image `node:20-alpine`) |
| PostgreSQL | 16+, managed service khuyến nghị |
| Redis | 8+, có auth/TLS trên production |
| Env vars | Xem [environment-variables.md](./environment-variables.md) |

## Docker build

```bash
docker build -t game-api:latest .
```

### Dockerfile stages

1. **deps** — `npm ci`
2. **build** — `prisma generate` + `npm run build` + `npm prune --omit=dev`
3. **runtime** — copy `dist/`, `prisma/`, `node_modules/`, chạy non-root user `node`

### Startup command

```bash
npx prisma migrate deploy && node dist/main
```

Migration chạy **trước** khi app listen — đảm bảo schema up-to-date.

> Có thể tách `prisma migrate deploy` ra Pre-Deploy Command (Render, Railway, v.v.) nếu muốn.

### Port

App đọc `process.env.PORT` (mặc định 3000). Platform như Render tự inject `PORT` — **không** hardcode trong Dockerfile.

## Environment variables (production)

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
PORT=3000

# Optional — FCM
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

**Lưu ý `FIREBASE_PRIVATE_KEY`:** Dùng `\n` literal trong env string, không xuống dòng thật.

## Health check / probes

```bash
GET /api/health
```

| HTTP | Ý nghĩa |
| ---- | ------- |
| 200 | Postgres + Redis connected |
| 503 | Một hoặc cả hai dependency down |

Kubernetes example:

```yaml
readinessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 15

livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 30
```

Chi tiết: [apis/health-check.md](../apis/health-check.md).

## Security checklist

- [ ] Đổi credential Postgres/Redis mặc định (không dùng `1234abcd`)
- [ ] Redis có password + TLS (managed Redis)
- [ ] Postgres không expose public port
- [ ] `NODE_ENV=production` — không leak stack trace
- [ ] Reverse proxy (nginx/Caddy) terminate TLS
- [ ] CORS: cân nhắc whitelist origin thay vì `*` (hiện tại open trong `main.ts`)
- [ ] Không commit `.env` — dùng secret manager platform

## Partition maintenance

`MaintenanceService` tự tạo partition `game_results_<YYYY>` khi:

- App startup (`onModuleInit`)
- Cron `0 3 1 * *` (ngày 1 mỗi tháng, 3:00 AM server time)

Đảm bảo app chạy liên tục hoặc có ít nhất một instance active qua đầu năm.

Xem: [schedule/game-results-partition.md](../schedule/game-results-partition.md).

## Scheduled jobs trên production

Notification cron (`Saturday rank`, `FCM retry`) chạy trong process NestJS (`@nestjs/schedule`).

- **Single instance** hoặc leader election nếu scale horizontal — tránh duplicate Saturday broadcast.
- BullMQ workers chạy trong cùng process — scale cẩn thận (nhiều worker = nhiều consumer, thường OK cho FCM delivery).

Xem: [schedule/fcm-notification-jobs.md](../schedule/fcm-notification-jobs.md).

## Deploy flow (manual)

```bash
# 1. Build image
docker build -t game-api:v1.0.0 .

# 2. Push registry (ví dụ)
docker tag game-api:v1.0.0 registry.example.com/game-api:v1.0.0
docker push registry.example.com/game-api:v1.0.0

# 3. Deploy với env vars đã set trên platform

# 4. Verify
curl https://api.example.com/api/health
```

## Rollback

- Giữ migration backward-compatible khi có thể
- `prisma migrate deploy` không tự rollback — cần migration down thủ công hoặc restore DB backup
- Rollback image về version trước nếu code issue (schema phải tương thích)

## Monitoring

Log quan trọng (NestJS `Logger`):

- `HttpExceptionFilter` — mọi HTTP error
- `MaintenanceService` — partition create/skip
- `FcmRetryScheduler` / `SaturdayRankScheduler` — notification jobs
- `Firebase is not configured` — push disabled

Chưa có `/api/metrics` (Prometheus) — optional tương lai.

## Related

- Local dev: [local-development.md](./local-development.md)
- Docker Compose (dev only): [docker.md](./docker.md)
