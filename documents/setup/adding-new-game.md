# Thêm game mới

Game được khai báo **trong source code** (type-safe), không có bảng `games` trong database. Thêm game mới yêu cầu deploy backend **và** cập nhật client.

## Checklist

- [ ] Thêm `GameId` enum trong backend
- [ ] Thêm entry `GAME_CONFIG` với `replaySecret`
- [ ] (Tuỳ chọn) Thêm `rankPushCron` nếu cần scheduled rank push (`rank_push`)
- [ ] Sync Prisma schema + migration
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
    replaySecret: '<64-char-hex-sha256>',
    rankPushCron: '0 9 * * 6', // optional
  },
};
```

### `replaySecret` requirements

- SHA-256 hex string, **64 ký tự**
- Entropy tối thiểu 32 bytes (generate bằng `openssl rand -hex 32`)
- **Không** đọc từ biến môi trường backend — hardcode trong `GAME_CONFIG`
- Client dùng cùng giá trị qua `VITE_REPLAY_SECRET`

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
- Device tokens + notifications (Top 100; scheduled rank push nếu có `rankPushCron`)
- Partition `game_results` (theo `createdAt`, không theo game)

Module `ResultsDataModule` export `ResultsRepository` dùng chung — không cần sửa khi thêm game.

## 4. Client — game-starter-kit

```env
VITE_GAME_ID=MYGAME
VITE_REPLAY_SECRET=<cùng replaySecret với GAME_CONFIG>
VITE_API_URL=https://your-api.example.com/api
```

Client đọc env qua `src/game/config.ts` (`id`, `replaySecret`) và `src/platform/core/config/index.ts` (preset API URL, feature flags).

HMAC payload phải khớp backend:

```ts
`${gameId}|${guestId}|${clientResultId}|${score}|${playedAt || ''}`;
```

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
- Build spec: [GAME_API_BUILD_SPEC.md](../GAME_API_BUILD_SPEC.md)
- Frontend sync: `game-starter-kit/documents/modules/game-result-sync.md`
