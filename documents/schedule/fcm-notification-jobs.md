# FCM Notification Jobs

Cron + BullMQ workers for push notifications (no DB outbox).

## Jobs

| Job                 | Schedule                            | Timezone           | File                                                     |
| ------------------- | ----------------------------------- | ------------------ | -------------------------------------------------------- |
| Rank push broadcast | Per-game `GAME_CONFIG.rankPushCron` | `Asia/Ho_Chi_Minh` | `src/features/notifications/jobs/rank-push.scheduler.ts` |
| Top 100 exit push   | On score submit (async in-process event; no queue) | — | `src/features/notifications/top100-exit-notification.listener.ts` |

Partition maintenance is **not** an FCM job — see [game-results-partition.md](./game-results-partition.md) (`59 23 28-31 * *`).

Game **without** `rankPushCron` in `GAME_CONFIG` → no weekly rank-push cron for that game.

Example FRULOOP: `rankPushCron: '0 9 * * 6'` (Saturday 09:00 VN).

## Push types

| `type`           | When                                              | Route         |
| ---------------- | ------------------------------------------------- | ------------- |
| `rank_push`      | Per-game scheduled broadcast for token holders who have a rank | `Leaderboard` |
| `top_100_exited` | Guest previously at #100 is displaced by another guest entering Top 100 | `Leaderboard` |

FCM `data` payload: `{ type, route }`; rank is interpolated into localized notification text but is not included in `data`. Android uses high priority and channel `game_alerts`; APNs requests default sound. Locale templates are EN / VI, with non-Vietnamese values falling back to English.

## BullMQ

| Queue                    | Worker              |
| ------------------------ | ------------------- |
| `rank-push-notification` | `RankPushProcessor` |

**Single Nest instance recommended** for cron: multiple replicas enqueue duplicate broadcasts (no jobId lock).

## Scheduled rank push flow

1. `RankPushScheduler.onModuleInit()` registers per-game cron from `GAME_CONFIG`
2. Cron → enqueue `START_RANK_PUSH_BROADCAST`
3. Start job chains `SEND_RANK_PUSH_BATCH` jobs; each loads up to 500 guests with `fcmToken`, ordered/cursored by guest ID
4. `resolveRank` (same order as leaderboard: `bestScore DESC`, `guestId ASC`)
5. Guests without a leaderboard entry are skipped; remaining guests are sent sequentially in the worker
6. Every non-empty batch enqueues the next cursor batch; the first empty batch completes the broadcast

## Top 100 exit flow

1. `POST /results` inserts at least one valid, non-duplicate result and raises the submitter's best score
2. Before upsert, capture submitter `previousRank` and the guest at #100 using the public tie-break (`bestScore DESC`, `guestId ASC`)
3. After upsert, resolve both ranks. Normally a submitter entering Top 100 displaces the previous #100; concurrent updates can also move the submitter from an old ≤100 snapshot to a newly resolved rank >100
4. Emit `PlayerExitedTop100Event` only for a guest whose old rank was ≤100 and new rank is >100; there is no Top-100-entry event or push
5. Event → `Top100ExitNotificationListener` → FCM `top_100_exited`

`@OnEvent(..., { async: true })` listener trả Promise nhưng publisher dùng `eventEmitter.emit()`, nên request submit không await kết quả FCM.

## Delivery semantics

- No separate FCM retry / outbox table
- Queue jobs do not configure custom `attempts`, backoff, deduplication, or stable job IDs
- Missing Firebase credentials → push disabled; device APIs still work
- Invalid FCM token → clear token fields on `guest_players`
- Other FCM failures are logged and return `false`; they are not retried by application code
