# FCM Notification Scheduled Jobs

Tài liệu cron + worker cho notification trong kiến trúc hiện tại (không outbox DB).

## Jobs

| Job                     | Schedule    | Timezone           | File                                                         |
| ----------------------- | ----------- | ------------------ | ------------------------------------------------------------ |
| Saturday rank broadcast | `0 9 * * 6` | `Asia/Ho_Chi_Minh` | `src/features/notifications/jobs/saturday-rank.scheduler.ts` |
| Partition maintenance   | `0 3 1 * *` | server local       | `src/infra/maintenance/maintenance.service.ts`               |

## BullMQ queues

| Queue                        | Worker                  |
| ---------------------------- | ----------------------- |
| `saturday-rank-notification` | `SaturdayRankProcessor` |
| `fcm-delivery`               | `FcmDeliveryProcessor`  |

## Saturday flow

1. `SaturdayRankScheduler` enqueue `start-saturday-broadcast`
2. `SaturdayRankProcessor` đọc batch guest có `fcmToken`
3. Resolve rank từng guest
4. `NotificationDispatcherService.sendSaturdayRank()` enqueue job `deliver-fcm`
5. `FcmDeliveryProcessor` gọi `NotificationQueueService.deliver()`

## Delivery semantics

- Không retry scheduler riêng cho FCM
- Không outbox table (`notification_outbox`)
- Nếu Firebase disabled hoặc guest bị mute/không token thì skip
- Invalid token từ FCM -> clear token ở `guest_players`
