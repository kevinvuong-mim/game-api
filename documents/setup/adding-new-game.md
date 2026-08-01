# Thêm game mới

Game được khai báo **trong source code** (type-safe), không có bảng `games` trong database.

## Quy tắc bắt buộc

**Mỗi game mới = đúng 1 PR trên `game-api`**, gồm đủ cả ba phần:

1. **`GameId`** — thêm giá trị vào Prisma enum (+ migration)
2. **`GAME_CONFIG`** — thêm entry trong `src/common/constants/game.constants.ts` (`replaySecret`, optional `rankPushCron`)
3. **Migrate** — `npm run prisma:migrate` (và `prisma:generate`) rồi deploy

Client (`game-apps`) chỉ đổi `VITE_GAME_ID` + `VITE_REPLAY_SECRET` **sau** khi PR API đã merge/deploy. Không thể “chỉ clone kit” mà bỏ qua PR API — các DTO `@IsEnum(GameId)` sẽ từ chối game chưa có bằng HTTP 400.

Thêm game mới luôn yêu cầu deploy backend **và** cập nhật client (coordinated release).

## Checklist

- [ ] Mở 1 PR `game-api` với đủ: `GameId` + `GAME_CONFIG` + migrate
- [ ] Thêm `GameId` enum trong Prisma schema
- [ ] Thêm entry `GAME_CONFIG` với `replaySecret`
- [ ] (Tuỳ chọn) Thêm `rankPushCron` nếu cần scheduled rank push (`rank_push`)
- [ ] Chạy migration + generate Prisma client
- [ ] Merge/deploy API trước (hoặc cùng lúc) client
- [ ] Cập nhật client `VITE_GAME_ID` + `VITE_REPLAY_SECRET`
- [ ] Test guest init, submit result, leaderboard

## 1. Backend — `game.constants.ts`

File: `src/common/constants/game.constants.ts`

```ts
export interface GameConfigEntry {
  replaySecret: string;
  rankPushCron?: string; // optional — cron rank push (FCM type `rank_push`)
}

export const GAME_CONFIG: Record<GameId, GameConfigEntry> = {
  [GameId.FRULOOP]: { ... },
  [GameId.MYGAME]: {
    replaySecret: '<64-char-lowercase-sha256-hex>',
    rankPushCron: '0 9 * * 6', // optional
  },
};
```

### `replaySecret` requirements

- SHA-256 hex string, **64 ký tự lowercase** (`/^[a-f0-9]{64}$/`) — `openssl rand -hex 32` đã đúng format
- Entropy tối thiểu 32 bytes
- **Không** đọc từ biến môi trường backend — hardcode trong `GAME_CONFIG`
- Client dùng cùng giá trị qua `VITE_REPLAY_SECRET` (validator client cũng chỉ chấp nhận lowercase)

```bash
openssl rand -hex 32
```

### `rankPushCron` (optional)

- Cron expression, timezone `Asia/Ho_Chi_Minh`
- **Không** có field → game không có scheduled rank push (`rank_push`)
- Ví dụ: `'0 9 * * 6'` = 9:00 Thứ 7 hàng tuần

Startup guard `validateGameSecrets()` sẽ **chặn app khởi động** nếu `replaySecret` sai format.

## 2. Prisma schema

File: `prisma/schema.prisma`

```prisma
enum GameId {
  FRULOOP
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
- Results submit + HMAC
- Leaderboard (PostgreSQL `leaderboards`)
- Device tokens + notifications (push exit cho guest bị một người chơi mới vào Top 100 đẩy ra; scheduled rank push nếu có `rankPushCron`)
- Partition `game_results` (theo `createdAt`, không theo game)

Module `ResultsDataModule` export `ResultsRepository` dùng chung — không cần sửa khi thêm game.

## 4. Client — game-apps

```env
VITE_GAME_ID=MYGAME
VITE_REPLAY_SECRET=<cùng replaySecret với GAME_CONFIG>
```

Client đọc game env qua [`game-apps/src/game/config.ts`](../../../game-apps/src/game/config.ts) (`id`, `replaySecret`). Runtime config cũng đọc hai biến này; API URL hiện lấy từ preset `VITE_APP_ENV` trong [`game-apps/src/platform/core/config/index.ts`](../../../game-apps/src/platform/core/config/index.ts), không đọc `VITE_API_URL`.

HMAC payload phải khớp backend (metadata canonical — keys sorted JSON, hoặc rỗng):

```ts
`${gameId}|${guestId}|${clientResultId}|${score}|${playedAt || ''}|${canonicalMetadata}`;
```

HMAC là soft integrity thôi (secret nằm trên client) — **không phải anti-cheat**.

## 5. Rotate `replaySecret`

Khi cần đổi secret (bảo mật hoặc leak):

1. Deploy backend + client **cùng lúc** (coordinated release)
2. Trong cửa sổ rotate: signature cũ invalid → pending results trên client bị reject
3. Nên rotate khi traffic thấp

## 6. Verify sau deploy

```bash
curl -X POST https://api.example.com/api/guest/init \
  -H "Content-Type: application/json" \
  -d '{"gameId": "MYGAME"}'

curl "https://api.example.com/api/leaderboards?gameId=MYGAME"
```

## Related

- HMAC chi tiết: [apis/results.md](../apis/results.md)
- Frontend sync: [game-apps/documents/modules/game-result-sync.md](../../../game-apps/documents/modules/game-result-sync.md)
- Push jobs: [schedule/fcm-notification-jobs.md](../schedule/fcm-notification-jobs.md)
