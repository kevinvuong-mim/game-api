# FCM Notification Scheduled Jobs

Tài liệu cron + worker cho notification trong kiến trúc hiện tại (không outbox DB).

## Jobs

| Job                   | Schedule                            | Timezone           | File                                                     |
| --------------------- | ----------------------------------- | ------------------ | -------------------------------------------------------- |
| Rank push broadcast   | Per-game `GAME_CONFIG.rankPushCron` | `Asia/Ho_Chi_Minh` | `src/features/notifications/jobs/rank-push.scheduler.ts` |
| Partition maintenance | `0 3 1 * *`                         | server local       | `src/infra/maintenance/maintenance.service.ts`           |

Game **không** có `rankPushCron` trong `GAME_CONFIG` → không đăng ký cron rank push cho game đó.

Ví dụ FRULOOP: `rankPushCron: '0 9 * * 6'` (9:00 Thứ 7).

## BullMQ queues

| Queue                    | Worker              |
| ------------------------ | ------------------- |
| `rank-push-notification` | `RankPushProcessor` |

Top 100 push **không** dùng BullMQ — gửi FCM inline qua `NotificationDeliveryService` (`deliver()` trả `result.success`; enter chỉ set `top100EnterNotified` sau push thành công).

## Scheduled rank push flow (`rankPushCron`)

1. `RankPushScheduler.onModuleInit()` đăng ký cron per-game từ `GAME_CONFIG`
2. Cron fire → `RankPushCronService.enqueueRankPushBroadcast(gameId)`
3. `RankPushProcessor` đọc batch guest có `fcmToken` (filter `gameId`)
4. Resolve rank từng guest
5. `NotificationDispatcherService.sendRankPush()` → `NotificationDeliveryService.deliver()` inline

## Delivery semantics

- Không retry scheduler riêng cho FCM
- Không outbox table (`notification_outbox`)
- Nếu Firebase disabled hoặc guest bị mute/không token thì skip
- Invalid token từ FCM → clear token ở `guest_players`
