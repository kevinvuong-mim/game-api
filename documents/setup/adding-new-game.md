# Thêm game mới

Game được khai báo **trong source code** (type-safe), không có bảng `games` trong database. Thêm game mới yêu cầu deploy backend **và** cập nhật client.

## Checklist

- [ ] Thêm `GameId` enum trong backend
- [ ] Thêm entry `GAME_CONFIG` với `replaySecret`
- [ ] Sync Prisma schema + migration
- [ ] Cập nhật client `VITE_GAME_ID` + `VITE_REPLAY_SECRET`
- [ ] Test guest init, submit result, leaderboard

## 1. Backend — `game.constants.ts`

File: `src/common/constants/game.constants.ts`

```ts
export enum GameId {
  FRULOOP = 'FRULOOP',
  MYGAME = 'MYGAME',   // thêm
}

export const GAME_CONFIG: Record<GameId, { name: string; replaySecret: string }> = {
  [GameId.FRULOOP]: { ... },
  [GameId.MYGAME]: {
    name: 'My Game',
    replaySecret: '<64-char-hex-sha256>',
  },
} as const;
```

### `replaySecret` requirements

- SHA-256 hex string, **64 ký tự**
- Entropy tối thiểu 32 bytes (generate bằng `openssl rand -hex 32`)
- **Không** đọc từ biến môi trường backend — hardcode trong `GAME_CONFIG`
- Client dùng cùng giá trị qua `VITE_REPLAY_SECRET`

```bash
openssl rand -hex 32
```

Startup guard `validateGameSecrets()` sẽ **chặn app khởi động** nếu secret sai format.

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
# Nhập tên migration, ví dụ: add_mygame_enum
npm run prisma:generate
```

PostgreSQL enum `GameId` được cập nhật qua `ALTER TYPE`.

## 3. Không cần thay đổi

Các module sau tự động hỗ trợ game mới qua `GameId` enum:

- Guest init / auth
- Results submit + HMAC
- Leaderboard (Redis key `leaderboard:{gameId}`)
- Device tokens + notifications
- Partition `game_results` (theo `createdAt`, không theo game)

## 4. Client — game-starter-kit

```env
VITE_GAME_ID=MYGAME
VITE_REPLAY_SECRET=<cùng replaySecret với GAME_CONFIG>
VITE_API_URL=https://your-api.example.com/api
```

File `src/game/config.ts` đọc các biến trên.

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
# Init guest
curl -X POST https://api.example.com/api/guest/init \
  -H "Content-Type: application/json" \
  -d '{"gameId": "MYGAME"}'

# Leaderboard (empty ban đầu)
curl "https://api.example.com/api/leaderboards?gameId=MYGAME"
```

Submit result qua game client hoặc script ký HMAC đúng.

## Related

- HMAC chi tiết: [apis/results.md](../apis/results.md)
- Build spec Section 16: [GAME_API_BUILD_SPEC.md](../../GAME_API_BUILD_SPEC.md)
- Frontend sync: `game-starter-kit/documents/modules/game-result-sync.md`
