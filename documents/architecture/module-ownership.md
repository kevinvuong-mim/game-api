# Module ownership

After the ownership refactor, each Nest feature owns a clear data boundary.

## Data modules

| Module                  | Owns                                                             | Exported for                                          |
| ----------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| `GuestDataModule`       | `GuestRepository`                                                | Auth, guest HTTP, devices/FCM, leaderboard names      |
| `LeaderboardDataModule` | `LeaderboardRepository`, `LeaderboardScoreApplyService`          | Rank reads/writes, TX score-apply + rank delta        |
| `ResultsDataModule`     | `ResultsRepository` (+ imports LeaderboardData)                  | Result insert/dedup; calls score-apply inside same TX |
| `CommonModule` (global) | `GuestAuthGuard`, `RateLimitGuard`; re-exports `GuestDataModule` | All features (auth without importing GuestModule)     |

## Feature modules

| Module                | Responsibility                                                                |
| --------------------- | ----------------------------------------------------------------------------- |
| `GuestModule`         | HTTP guest init/name (`GuestService` + controller); imports `GuestDataModule` |
| `ResultsModule`       | HMAC verify + submit batch + rank tracker side-effects                        |
| `LeaderboardModule`   | Public leaderboard query + rank resolver/tracker                              |
| `NotificationsModule` | Devices HTTP + FCM delivery + rank-push BullMQ; imports `GuestDataModule`     |

## Guest table (`guest_players`)

All reads/writes go through **`GuestRepository`** (provided by **`GuestDataModule`**):

- Auth / name: `findByAuthTokenHash`, `create`, `updateName`, `findNamesByIds`
- FCM columns: `registerFcmToken`, `updateFcmToken`, `unregisterFcmToken`, `findActiveFcmToken*`, `markFcmTokenInvalid`

`DeviceTokenService` maps domain errors (`FcmTokenConflictError`, null) to HTTP. There is no separate `DeviceTokenRepository`.

## Results vs leaderboard TX

`ResultsRepository.submitValidatedBatch` inserts/dedups results only, then calls `LeaderboardScoreApplyService.applyBestScoreAndCollectDelta` inside the same Prisma transaction. Top-100 snapshot uses `TOP_100_THRESHOLD`. Rank formula is shared via `resolveRankFromScoreTx` / `LeaderboardRankResolverService.resolveRankTx`.

## Auth wiring

`GuestAuthGuard` is registered in **`CommonModule`**, not `GuestModule`. Feature modules do **not** import `GuestModule` only for auth.

## Notifications pipeline

```
Listener / RankPushProcessor
  → NotificationDeliveryService.sendTop100Exited | sendRankPush | deliver
    → DeviceTokenService → GuestRepository
    → FcmService
```

Rank-push batch jobs call `LeaderboardRankResolverService.resolveRanks(gameId, guestIds)` (one SQL for the page) before the per-device send loop.

Rank-push files:

| File                          | Role                       |
| ----------------------------- | -------------------------- |
| `jobs/rank-push-week.util.ts` | ISO week key               |
| `jobs/rank-push.enqueue.ts`   | `RankPushEnqueueService`   |
| `jobs/rank-push.processor.ts` | BullMQ worker              |
| `jobs/rank-push.scheduler.ts` | Per-game cron registration |

## Constants

| File                        | Contents                                                                  |
| --------------------------- | ------------------------------------------------------------------------- |
| `leaderboard.constants.ts`  | `TOP_100_THRESHOLD`                                                       |
| `notification.constants.ts` | Queues, jobs, FCM channel, i18n, `toNotificationLocaleCode`               |
| `game.constants.ts`         | `GAME_CONFIG`, `validateGameId` (throws `UnsupportedGameError`, not HTTP) |

HTTP mapping for unknown game IDs: `requireGameId()` in `common/utils/game-id.util.ts`.
