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

Chi tiết Docker: [docker.md](./docker.md).

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
```

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
  -d '{"gameId": "FRULOOP"}'
```

Lưu `secretToken` và `guestId` từ response.

### Submit result (cần HMAC)

Client game-starter-kit tự ký HMAC. Để test thủ công, dùng `replaySecret` khớp `GAME_CONFIG` trong `src/common/constants/game.constants.ts` (và `VITE_REPLAY_SECRET` trên client).

### Leaderboard

```bash
curl "http://localhost:3000/api/leaderboards?gameId=FRULOOP&page=1&limit=10"
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
| `npm run prisma:migrate` | Tạo/apply migration (dev) |
| `npm run prisma:reset`   | Reset DB (dev only)       |

## Prisma Studio (optional)

```bash
npx prisma studio
```

Mở UI tại `http://localhost:5555` để xem/edit data.

## Kết nối với game-starter-kit

Trên client, set:

```env
VITE_API_URL=http://localhost:3000/api
VITE_GAME_ID=FRULOOP
VITE_REPLAY_SECRET=<khớp GAME_CONFIG replaySecret>
```

Chạy client trên emulator/device cùng mạng LAN nếu không dùng localhost (dùng IP máy dev thay `localhost`).

## Troubleshooting

| Vấn đề                   | Giải pháp                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `EADDRINUSE :3000`       | Đổi `PORT` hoặc kill process: `lsof -i :3000`                                       |
| Health 503               | Kiểm tra Postgres (`DATABASE_URL`, `docker-compose`); Redis down chỉ → 200 degraded |
| `Game "X" not supported` | Dùng `FRULOOP` hoặc thêm game — [adding-new-game.md](./adding-new-game.md)          |
| HMAC invalid             | Đảm bảo `replaySecret` client = backend `GAME_CONFIG`                               |
| Push không gửi           | Kiểm tra `FIREBASE_*`, device token `ACTIVE`, không bị mute                         |

Xem thêm troubleshooting env: [environment-variables.md](./environment-variables.md).
