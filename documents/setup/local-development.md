# Local Development

Hướng dẫn chạy `game-api` trên máy dev từ đầu.

**Yêu cầu:** Node.js ≥ 20, npm, Docker + Docker Compose.

## 1. Clone và cài dependencies

```bash
cd game-api
npm install
```

## 2. Khởi động Postgres + Redis

```bash
docker-compose up -d
```

Kiểm tra:

```bash
docker-compose ps
curl -s http://localhost:3000/api/health   # sẽ fail cho đến khi API chạy
docker-compose exec redis redis-cli ping    # PONG
docker-compose exec postgres pg_isready -U kwong2000 -d game-api
```

### Thông tin kết nối Docker (dev)

| Service    | Host      | Port | Credentials                             |
| ---------- | --------- | ---- | --------------------------------------- |
| PostgreSQL | localhost | 5432 | `kwong2000` / `1234abcd`, DB `game-api` |
| Redis      | localhost | 6379 | Không password                          |

```bash
docker-compose stop      # giữ data
docker-compose down      # xóa container, giữ volume
docker-compose down -v   # xóa cả data (dev only)
```

## 3. Cấu hình environment

```bash
cp .env.example .env
```

Tối thiểu cần:

```env
DATABASE_URL="postgresql://kwong2000:1234abcd@localhost:5432/game-api"
REDIS_URL="redis://localhost:6379"
PORT=3000
NODE_ENV="development"
API_KEY="change-me"
```

`API_KEY` bắt buộc cho mọi route trừ `GET /api/health`. Giá trị `change-me` khớp `.env.example` — chỉ dùng local.

Firebase (`FIREBASE_*`) **optional** — bỏ trống nếu chưa test push. Xem [environment-variables.md](./environment-variables.md).

## 4. Database migration

```bash
npm run prisma:migrate
npm run prisma:generate
```

> Bảng `game_results` dùng PostgreSQL partitioning qua custom SQL migration. Không xóa migration `..._partition_game_results`.

Nếu migration lỗi:

```bash
# Đảm bảo Postgres đang chạy và DATABASE_URL đúng
docker-compose logs postgres
npm run prisma:reset   # CHỈ dev — xóa toàn bộ data
```

## 5. Chạy API server

```bash
npm run start:dev
```

Server: `http://localhost:3000/api`

Log mong đợi:

```
Application is running on: http://localhost:3000/api
```

Nếu có Firebase env hợp lệ: `Firebase Admin SDK initialized`.

## 6. Verify end-to-end

### Health check

```bash
curl http://localhost:3000/api/health
```

Kỳ vọng: HTTP 200, `data.status: "ok"`, cả `db` và `redis` là `connected`.

### Guest init

```bash
curl -X POST http://localhost:3000/api/guest/init \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: change-me" \
  -d '{"gameId": "FRULOOP"}'
```

Lưu `secretToken` và `guestId` từ response.

### Submit result

```bash
curl -X POST http://localhost:3000/api/results \
  -H "Authorization: Bearer <secretToken>" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: change-me" \
  -d '{
    "gameId": "FRULOOP",
    "items": [
      { "clientResultId": "test-001", "score": 1000 }
    ]
  }'
```

### Leaderboard

```bash
curl "http://localhost:3000/api/leaderboards?gameId=FRULOOP&page=1&limit=10" \
  -H "X-Api-Key: change-me"
```

## Scripts hữu ích

| Command                  | Mô tả                     |
| ------------------------ | ------------------------- |
| `npm run start:dev`      | Dev server + hot reload   |
| `npm run start:debug`    | Dev + Node inspector      |
| `npm run build`          | Compile TypeScript        |
| `npm run start:prod`     | Chạy `dist/main`          |
| `npm run lint`           | ESLint                    |
| `npm run format`         | Prettier                  |
| `npm run test`           | Jest unit tests           |
| `npm run typecheck`      | `tsc --noEmit`            |
| `npm run prisma:migrate` | Tạo/apply migration (dev) |
| `npm run prisma:reset`   | Reset DB (dev only)       |

## Prisma Studio (optional)

```bash
npx prisma studio
```

Mở UI tại `http://localhost:5555` để xem/edit data.

## Kết nối với game-app

Trên client, set:

```env
VITE_APP_ENV=dev
VITE_GAME_ID=MEMORA
VITE_API_KEY=change-me
```

`VITE_API_KEY` phải khớp `API_KEY` của `game-api`. Preset `dev` trong [`game-app/src/platform/core/config/index.ts`](../../../game-app/src/platform/core/config/index.ts) dùng `https://game-api-s5kn.onrender.com/api` (cùng URL production). Client không đọc `VITE_API_URL`. Để trỏ local API, tạm sửa preset `apiUrl` trong `config/index.ts`.

## Troubleshooting

| Vấn đề                      | Giải pháp                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `EADDRINUSE :3000`          | Đổi `PORT` hoặc kill process: `lsof -i :3000`                                                                         |
| Health 503                  | Kiểm tra Postgres (`DATABASE_URL`) **và** Redis (`REDIS_URL`, `docker-compose`) — cả hai phải connected               |
| Validation 400 cho `gameId` | Dùng `FRULOOP` / `MEMORA` hoặc thêm game vào Prisma enum + `GAME_CONFIG` — [adding-new-game.md](./adding-new-game.md) |
| `401 Invalid API key`       | Gửi header `X-Api-Key` khớp `API_KEY` trong `.env` (local: `change-me` nếu copy từ `.env.example`)                    |
| Push không gửi              | Kiểm tra đủ `FIREBASE_*`, guest có `fcmToken`, có leaderboard rank; backend không có status/mute                      |

Xem thêm troubleshooting env: [environment-variables.md](./environment-variables.md).
