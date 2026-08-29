# Thêm game mới

Game được khai báo **trong source code** (type-safe), không có bảng `games` trong database.

## Quy tắc bắt buộc

**Mỗi game mới = đúng 1 PR trên `game-api`**, gồm đủ cả ba phần:

1. **`GameId`** — thêm giá trị vào Prisma enum (+ migration)
2. **`GAME_CONFIG`** — thêm entry trong `src/common/constants/game.constants.ts` (optional `rankPushCron`)
3. **Migrate** — `npm run prisma:migrate` (và `prisma:generate`) rồi deploy

Client (`game-app`) chỉ đổi `VITE_GAME_ID` **sau** khi PR API đã merge/deploy. Không thể “chỉ clone kit” mà bỏ qua PR API — các DTO `@IsEnum(GameId)` sẽ từ chối game chưa có bằng HTTP 400.

Thêm game mới luôn yêu cầu deploy backend **và** cập nhật client (coordinated release).

## Checklist

- [ ] Mở 1 PR `game-api` với đủ: `GameId` + `GAME_CONFIG` + migrate
- [ ] Thêm `GameId` enum trong Prisma schema
- [ ] Thêm entry `GAME_CONFIG` (có thể `{}` nếu không cần rank push)
- [ ] (Tuỳ chọn) Thêm `rankPushCron` nếu cần scheduled rank push (`rank_push`)
- [ ] Chạy migration + generate Prisma client
- [ ] Merge/deploy API trước (hoặc cùng lúc) client
- [ ] Cập nhật client `VITE_GAME_ID`
- [ ] Test guest init, submit result, leaderboard

## 1. Backend — `game.constants.ts`

File: `src/common/constants/game.constants.ts`

```ts
export interface GameConfigEntry {
  rankPushCron?: string; // optional — cron rank push (FCM type `rank_push`)
}

export const GAME_CONFIG: Record<GameId, GameConfigEntry> = {
  [GameId.FRULOOP]: { ... },
  [GameId.MEMORA]: { ... },
  [GameId.MYGAME]: {
    rankPushCron: '0 9 * * 6', // optional
  },
};
```

### `rankPushCron` (optional)

- Cron expression, timezone `Asia/Ho_Chi_Minh`
- **Không** có field → game không có scheduled rank push (`rank_push`)
- Ví dụ: `'0 9 * * 6'` = 9:00 Thứ 7 hàng tuần

## 2. Prisma schema

File: `prisma/schema.prisma`

```prisma
enum GameId {
  FRULOOP
  MEMORA
  MYGAME   // thêm
}
```

Chạy migration:

```bash
npm run prisma:migrate
npm run prisma:generate
```

## 3. Không cần thay đổi

Các module sau tự động hỗ trợ game mới qua `GameId` enum:

- Guest init / auth
- Results submit (Bearer auth + `clientResultId` dedup)
- Leaderboard (PostgreSQL `leaderboards`)
- Device tokens + notifications (push exit cho guest bị một người chơi mới vào Top 100 đẩy ra; scheduled rank push nếu có `rankPushCron`)
- Partition `game_results` (theo `createdAt`, không theo game)

`ResultsRepository` nằm trong `ResultsModule` — không cần sửa khi thêm game (đã key theo `GameId`).

## 4. Client — game-app

```env
VITE_GAME_ID=MYGAME
```

Client đọc game id qua [`game-app/src/game/config.ts`](../../../game-app/src/game/config.ts). Runtime config cũng đọc `VITE_GAME_ID`; API URL hiện lấy từ preset `VITE_APP_ENV` trong [`game-app/src/platform/core/config/index.ts`](../../../game-app/src/platform/core/config/index.ts), không đọc `VITE_API_URL`.

## 5. Verify sau deploy

```bash
curl -X POST https://api.example.com/api/guest/init \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <API_KEY>" \
  -d '{"gameId": "MYGAME"}'

curl "https://api.example.com/api/leaderboards?gameId=MYGAME" \
  -H "X-Api-Key: <API_KEY>"
```

## Related

- Results API: [apis/results.md](../apis/results.md)
- Frontend sync: [game-app/documents/modules/game-result-sync.md](../../../game-app/documents/modules/game-result-sync.md)
- Push jobs: [schedule/fcm-notification-jobs.md](../schedule/fcm-notification-jobs.md)
