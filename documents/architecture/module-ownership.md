# Module ownership

After the ownership refactor, each Nest feature owns a clear data boundary.

## Data modules

| Module                  | Owns                                                             | Exported for                                      |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| `GuestDataModule`       | `GuestRepository`                                                | Auth, guest HTTP, devices/FCM, leaderboard names  |
| `LeaderboardDataModule` | `LeaderboardRepository`, `LeaderboardScoreApplyService`          | Rank reads/writes, TX score-apply + rank delta    |
| `CommonModule` (global) | `ApiKeyGuard` (`APP_GUARD`), `GuestAuthGuard`, `RateLimitGuard`; re-exports `GuestDataModule` | All features (auth without importing GuestModule) |

`ResultsRepository` is **not** in a separate data module — it is provided by `ResultsModule` (see below).

## Feature modules

| Module                | Responsibility                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `GuestModule`         | HTTP guest init/name (`GuestService` + controller); imports `GuestDataModule`                           |
| `ResultsModule`       | Submit batch; providers `[ResultsService, ResultsRepository]`; Top-100 exit side-effect after submit    |
| `LeaderboardModule`   | Leaderboard query (`X-Api-Key`, no Bearer) + `LeaderboardRankResolverService`; exports resolver + `LeaderboardDataModule` |
| `NotificationsModule` | Devices HTTP + FCM delivery + rank-push BullMQ; imports `GuestDataModule`, `LeaderboardModule` |
| `MaintenanceModule`   | Wires `PartitionService` (partition cron + ensure helpers)                                              |

`ResultsModule` imports `LeaderboardDataModule`, `LeaderboardModule`, `NotificationsModule`, and `MaintenanceModule`.

## Guest table (`guest_players`)

All reads/writes go through **`GuestRepository`** (provided by **`GuestDataModule`**):

- Auth / name: `findByAuthTokenHash`, `create`, `updateName`, `findNamesByIds`
- FCM columns: `registerFcmToken`, `updateFcmToken`, `unregisterFcmToken`, `findActiveFcmToken*`, `markFcmTokenInvalid`

`DeviceTokenService` maps domain errors (`FcmTokenConflictError`, null) to HTTP. There is no separate `DeviceTokenRepository`.

## Results vs leaderboard TX

`ResultsRepository.submitValidatedBatch` ensures the year partition **before** the Prisma transaction (DDL is not inside the submit TX), then inserts/dedups results and calls `LeaderboardScoreApplyService.applyBestScoreAndCollectDelta` in the same TX (`maxWait` 10s / `timeout` 30s). The per-game advisory lock and Top-100 snapshot run only when the candidate score is a new best. Rank formula is shared: `LeaderboardScoreApplyService.resolveRankFromScoreTx` inside the submit TX, `LeaderboardRankResolverService.resolveRank` / `resolveRanks` outside the TX.

## Auth wiring

`GuestAuthGuard` and `RateLimitGuard` are registered in **`CommonModule`**. `ApiKeyGuard` is the global `APP_GUARD` (skip with `@SkipApiKey()` — health only). Feature modules do **not** import `GuestModule` only for auth.

## Notifications pipeline

```
ResultsService.notifyTop100ExitIfNeeded / RankPushProcessor
  → NotificationDeliveryService.sendTop100Exited | sendRankPush | deliver
    → DeviceTokenService → GuestRepository
    → FcmService
```

Rank-push batch jobs call `LeaderboardRankResolverService.resolveRanks(gameId, guestIds)` (one SQL for the page) before sending with concurrency 10. Cron enqueue errors are caught so they cannot crash the process.

Rank-push files:

| File                          | Role                       |
| ----------------------------- | -------------------------- |
| `jobs/rank-push-week.util.ts` | ISO week key               |
| `jobs/rank-push.enqueue.ts`   | `RankPushEnqueueService`   |
| `jobs/rank-push.processor.ts` | BullMQ worker              |
| `jobs/rank-push.scheduler.ts` | Per-game cron registration |

## Constants

| File                        | Contents                                                    |
| --------------------------- | ----------------------------------------------------------- |
| `leaderboard.constants.ts`  | `TOP_100_THRESHOLD` (rank cutoff, not a score)              |
| `notification.constants.ts` | Queues, jobs, FCM channel, i18n, batch/lock/concurrency, `toNotificationLocaleCode` |
| `game.constants.ts`         | `GAME_CONFIG` (`rankPushCron` optional per game)            |
