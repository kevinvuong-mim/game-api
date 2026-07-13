# FCM Notification Jobs

Cron + BullMQ workers for push notifications (no DB outbox).

## Jobs

| Job                 | Schedule                            | Timezone           | File                                                     |
| ------------------- | ----------------------------------- | ------------------ | -------------------------------------------------------- |
| Rank push broadcast | Per-game `GAME_CONFIG.rankPushCron` | `Asia/Ho_Chi_Minh` | `src/features/notifications/jobs/rank-push.scheduler.ts` |
| Top 100 exit push   | On score submit (inline)            | —                  | `top100-exit-notification.listener.ts`                   |

Partition maintenance is **not** an FCM job — see [game-results-partition.md](./game-results-partition.md) (`59 23 28-31 * *`).

Game **without** `rankPushCron` in `GAME_CONFIG` → no weekly rank-push cron for that game.

Example FRULOOP: `rankPushCron: '0 9 * * 6'` (Saturday 09:00 VN).

## Push types

| `type`           | When                                              | Route         |
| ---------------- | ------------------------------------------------- | ------------- |
| `rank_push`      | Weekly BullMQ broadcast for guests with FCM token | `Leaderboard` |
| `top_100_exited` | Player drops out of Top 100 after a better score  | `Leaderboard` |

FCM `data` payload: `{ type, route }`. Locale templates: EN / VI (`localeToCode` accepts `vi` / `VI`).

## BullMQ

| Queue                    | Worker              |
| ------------------------ | ------------------- |
| `rank-push-notification` | `RankPushProcessor` |

**Single Nest instance recommended** for cron: multiple replicas enqueue duplicate broadcasts (no jobId lock).

## Scheduled rank push flow

1. `RankPushScheduler.onModuleInit()` registers per-game cron from `GAME_CONFIG`
2. Cron → enqueue `START_RANK_PUSH_BROADCAST`
3. Worker loads guests with `fcmToken` in batches
4. `resolveRank` (same order as leaderboard: `bestScore DESC`, `guestId ASC`)
5. `NotificationDispatcherService.sendRankPush()` → FCM inline

## Top 100 exit flow

1. `POST /results` updates best score
2. `LeaderboardRankTrackerService` detects previous #100 displaced
3. Event → `Top100ExitNotificationListener` → FCM `top_100_exited`

## Delivery semantics

- No separate FCM retry / outbox table
- Missing Firebase credentials → push disabled; device APIs still work
- Invalid FCM token → clear token fields on `guest_players`
