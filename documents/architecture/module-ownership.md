# Module ownership

After the ownership refactor, each Nest feature owns a clear data boundary.

## Data modules

| Module | Owns | Exported for |
| --- | --- | --- |
| `CommonModule` (global) | `GuestRepository`, `GuestAuthGuard`, `RateLimitGuard` | All features (auth + guest_players access) |
| `LeaderboardDataModule` | `LeaderboardRepository` | Rank reads/writes, page queries, TX helpers |
| `ResultsDataModule` | `ResultsRepository` (+ imports LeaderboardData) | Result insert + leaderboard upsert inside one TX |

## Feature modules

| Module | Responsibility |
| --- | --- |
| `GuestModule` | HTTP guest init/name only (`GuestService` + controller) |
| `ResultsModule` | HMAC verify + submit batch + rank tracker side-effects |
| `LeaderboardModule` | Public leaderboard query + rank resolver/tracker |
| `NotificationsModule` | Devices HTTP + FCM delivery + rank-push BullMQ |

## Guest table (`guest_players`)

All reads/writes go through **`GuestRepository`** (provided by global `CommonModule`):

- Auth / name: `findByAuthTokenHash`, `create`, `updateName`, `findNamesByIds`
- FCM columns: `registerFcmToken`, `updateFcmToken`, `unregisterFcmToken`, `findActiveFcmToken*`, `markFcmTokenInvalid`

`DeviceTokenService` maps domain errors (`FcmTokenConflictError`, null) to HTTP. There is no separate `DeviceTokenRepository`.

## Auth wiring

`GuestAuthGuard` is registered in **`CommonModule`**, not `GuestModule`. Feature modules do **not** import `GuestModule` only for auth.

## Notifications pipeline

```
Listener / RankPushProcessor
  → NotificationDeliveryService.sendTop100Exited | sendRankPush | deliver
  → DeviceTokenService → GuestRepository
  → FcmService
```

Rank-push files:

| File | Role |
| --- | --- |
| `jobs/rank-push-week.util.ts` | ISO week key |
| `jobs/rank-push.enqueue.ts` | `RankPushEnqueueService` |
| `jobs/rank-push.processor.ts` | BullMQ worker |
| `jobs/rank-push.scheduler.ts` | Per-game cron registration |

## Constants

| File | Contents |
| --- | --- |
| `leaderboard.constants.ts` | `TOP_100_THRESHOLD` |
| `notification.constants.ts` | Queues, jobs, FCM channel, i18n, `toNotificationLocaleCode` |
| `game.constants.ts` | `GAME_CONFIG`, `validateGameId` (throws `UnsupportedGameError`, not HTTP) |

HTTP mapping for unknown game IDs: `requireGameId()` in `common/utils/game-id.util.ts`.
