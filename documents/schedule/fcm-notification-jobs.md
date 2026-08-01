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

FCM `data` payload: `{ type, route, ...params }` — stringified job params are merged into `data`. Both `rank_push` and `top_100_exited` pass `rank` into `data`. Rank push also interpolates `rank` into localized notification title/body (EN / VI; non-Vietnamese falls back to English) so the client can show a matching foreground toast.

Android uses high priority and channel `game_alerts`; APNs requests default sound.

## BullMQ

| Queue                    | Worker              |
| ------------------------ | ------------------- |
| `rank-push-notification` | `RankPushProcessor` |

Job defaults (`rank-push.enqueue.ts` → `RANK_PUSH_JOB_DEFAULTS`):

| Option | Value |
| --- | --- |
| `attempts` | `3` |
| `backoff` | exponential, `delay: 5000` |
| `removeOnComplete` | `true` |
| `removeOnFail` | keep last `100` |

Stable `jobId`s (week key in `Asia/Ho_Chi_Minh` via `getRankPushWeekKey()`):

| Job | `jobId` pattern |
| --- | --- |
| Start broadcast | `rank-push-start-{gameId}-{weekKey}` |
| First batch | `rank-push-batch-{gameId}-{weekKey}-start` |
| Cursor batch | `rank-push-batch-{gameId}-{weekKey}-{cursorGuestId}` |

**Single Nest instance still recommended** for cron registration: week-key `jobId`s dedupe duplicate enqueues within the same ISO week, but multiple replicas can still race on in-process Top-100-exit listeners and cron registration noise.

## Scheduled rank push flow

1. `RankPushScheduler.onModuleInit()` registers per-game cron from `GAME_CONFIG`
2. Cron → `RankPushEnqueueService.enqueueRankPushBroadcast` with `{ gameId, weekKey }` and the start `jobId`
3. Start job chains `SEND_RANK_PUSH_BATCH` jobs (`RankPushProcessor`); each loads up to 500 guests with `fcmToken`, ordered/cursored by guest ID
4. `resolveRank` (same order as leaderboard: `bestScore DESC`, `guestId ASC`)
5. Guests without a leaderboard entry are skipped; remaining guests are sent via `NotificationDeliveryService.sendRankPush`
6. Before each FCM send, claim Redis key `rank-push:sent:{gameId}:{weekKey}:{guestId}` (`SET NX`, TTL 8 days). Already claimed → skip (idempotent across BullMQ retries). Send failure clears the key so a later attempt can retry.
7. Every non-empty batch enqueues the next cursor batch; the first empty batch completes the broadcast

Source files: `rank-push-week.util.ts`, `rank-push.enqueue.ts`, `rank-push.processor.ts`, `rank-push.scheduler.ts`.

## Top 100 exit flow

1. `POST /results` inserts at least one valid, non-duplicate result and raises the submitter's best score
2. Before upsert, capture submitter `previousRank` and the guest at #100 using the public tie-break (`bestScore DESC`, `guestId ASC`)
3. After upsert, resolve both ranks. Normally a submitter entering Top 100 displaces the previous #100; concurrent updates can also move the submitter from an old ≤100 snapshot to a newly resolved rank >100
4. Emit `PlayerExitedTop100Event` only for a guest whose old rank was ≤100 and new rank is >100; there is no Top-100-entry event or push
5. Event → `Top100ExitNotificationListener` → FCM `top_100_exited`

`@OnEvent(..., { async: true })` listener trả Promise nhưng publisher dùng `eventEmitter.emit()`, nên request submit không await kết quả FCM.

## Delivery semantics

- No separate FCM retry / outbox table
- Rank-push queue jobs use BullMQ `attempts` / exponential backoff, week-key `jobId` dedupe, **and** per-guest Redis send markers (see flow step 6)
- Missing Firebase credentials → push disabled; device APIs still work
- Invalid FCM token → clear token fields on `guest_players`
- Other FCM failures are logged and return `false`; they are not retried by application code outside BullMQ job attempts (failed sends clear the send marker so the next attempt can retry that guest)
