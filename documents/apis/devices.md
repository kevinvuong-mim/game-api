# Devices API Documentation

## Overview

API quản lý FCM device token cho push notification trên thiết bị native (iOS/Android). Mỗi guest chỉ có **tối đa một** active token trên mỗi game (`@@unique([gameId, guestId])`). Token được dùng để backend gửi push (Top 100, Saturday rank broadcast, v.v.).

Gồm năm endpoint:

1. **Đăng ký device** (`POST /api/devices`): Lưu FCM token lần đầu hoặc sau khi cài lại app.
2. **Cập nhật device** (`PATCH /api/devices`): Token refresh hoặc đổi ngôn ngữ notification.
3. **Hủy đăng ký** (`DELETE /api/devices`): Đánh dấu token hiện tại là `INACTIVE`.
4. **Heartbeat** (`PATCH /api/devices/heartbeat`): Cập nhật `lastSeenAt` khi app resume.
5. **Preferences** (`PATCH /api/devices/preferences`): Bật/tắt push notification (lưu mute flag trên Redis).

**Base URL**: `/api/devices`

**Authentication**: Tất cả endpoint yêu cầu Bearer token (guest) — `gameId` và `guestId` lấy từ token, không gửi trong body.

---

## Endpoint: Register Device

**Endpoint**: `POST /api/devices`

**Rate Limit**: 10 requests / 60 giây (per guest)

**Authentication**: Required (Bearer Token)

### Request Headers

```
Authorization: Bearer <secretToken>
Content-Type: application/json
```

### Request Body

```json
{
  "token": "fcm-device-token-string",
  "platform": "ANDROID",
  "locale": "VI"
}
```

### Request Body Schema

| Field    | Type   | Required | Validation                    | Description                                      |
| -------- | ------ | -------- | ----------------------------- | ------------------------------------------------ |
| token    | string | Yes      | `@IsNotEmpty()`               | FCM registration token từ Capacitor / native SDK |
| platform | string | Yes      | `@IsEnum(DevicePlatform)`     | Nền tảng native: `IOS` \| `ANDROID`              |
| locale   | string | Yes      | `@IsEnum(NotificationLocale)` | Ngôn ngữ push notification: `EN` \| `VI`         |

### Business Logic

1. **Authenticate**: `GuestAuthGuard` xác thực Bearer token → lấy `gameId`, `guestId`.
2. **Rate limit check**: Giới hạn theo `guestId` (`rate:device:{guestId}`).
3. **Validate body**: Kiểm tra DTO (`RegisterDeviceDto`).
4. **Token ownership conflict** (trong transaction):
   - Nếu `token` đã thuộc guest khác → đánh dấu record đó `INACTIVE`.
5. **Upsert device** theo `@@unique([gameId, guestId])`:
   - **Create** nếu guest chưa có token: `status = ACTIVE`, `lastSeenAt = now`.
   - **Update** nếu đã có: ghi đè `token`, `platform`, `locale`, set lại `ACTIVE`.
6. **Return**: `deviceId`, `status`.

---

## Endpoint: Update Device

**Endpoint**: `PATCH /api/devices`

**Rate Limit**: 10 requests / 60 giây (per guest)

**Authentication**: Required (Bearer Token)

### Request Headers

```
Authorization: Bearer <secretToken>
Content-Type: application/json
```

### Request Body

```json
{
  "token": "new-fcm-device-token-string",
  "locale": "EN"
}
```

### Request Body Schema

| Field  | Type   | Required | Validation                    | Description                                     |
| ------ | ------ | -------- | ----------------------------- | ----------------------------------------------- |
| token  | string | Yes      | `@IsNotEmpty()`               | FCM token mới (sau refresh) hoặc token hiện tại |
| locale | string | Yes      | `@IsEnum(NotificationLocale)` | Ngôn ngữ push: `EN` \| `VI`                     |

### Business Logic

1. **Authenticate** + **Rate limit** (cùng guard như register).
2. **Validate body**: Kiểm tra `UpdateDeviceDto`.
3. **Find existing device** theo `(gameId, guestId)` — throw **404** nếu chưa từng register.
4. **Token ownership conflict**: Nếu `token` mới đang thuộc record khác → đánh dấu record đó `INACTIVE`.
5. **Update** record hiện tại: `token`, `locale`, `status = ACTIVE`, `lastSeenAt = now`.
6. **Return**: `deviceId`, `status`.

**Lưu ý**: Dùng khi FCM token refresh hoặc user đổi ngôn ngữ trong app. Nếu chưa gọi `POST /api/devices` lần nào, endpoint này trả 404.

---

## Endpoint: Unregister Device

**Endpoint**: `DELETE /api/devices`

**Rate Limit**: 10 requests / 60 giây (per guest)

**Authentication**: Required (Bearer Token)

### Request Headers

```
Authorization: Bearer <secretToken>
```

### Request Body

Không có body.

### Business Logic

1. **Authenticate** + **Rate limit**.
2. **UpdateMany**: Tất cả token `ACTIVE` của `(gameId, guestId)` → `INACTIVE`.
3. **Return**: `{ success: true }`.

Không throw lỗi nếu guest chưa có token active — `updateMany` trả về count 0, response vẫn thành công.

---

## Endpoint: Heartbeat

**Endpoint**: `PATCH /api/devices/heartbeat`

**Rate Limit**: 10 requests / 60 giây (per guest)

**Authentication**: Required (Bearer Token)

### Request Headers

```
Authorization: Bearer <secretToken>
```

### Request Body

Không có body.

### Business Logic

1. **Authenticate** + **Rate limit**.
2. **UpdateMany**: Cập nhật `lastSeenAt = now` cho token `ACTIVE` của guest.
3. **Return**: `{ success: true }`.

Dùng khi app resume từ background — giúp backend biết thiết bị còn hoạt động. Không cập nhật nếu không có token `ACTIVE`.

---

## Endpoint: Notification Preferences

**Endpoint**: `PATCH /api/devices/preferences`

**Rate Limit**: 10 requests / 60 giây (per guest)

**Authentication**: Required (Bearer Token)

### Request Headers

```
Authorization: Bearer <secretToken>
Content-Type: application/json
```

### Request Body

```json
{
  "enabled": false
}
```

### Request Body Schema

| Field   | Type    | Required | Validation     | Description                                       |
| ------- | ------- | -------- | -------------- | ------------------------------------------------- |
| enabled | boolean | Yes      | `@IsBoolean()` | `true` = nhận push; `false` = mute push cho guest |

### Business Logic

1. **Authenticate** + **Rate limit**.
2. **Set mute flag** trên Redis (`setNotificationMuted`) — `enabled: false` → muted.
3. **Return**: `{ success: true }`.

Không thay đổi `status` của device token. Dispatcher kiểm tra mute flag trước khi gửi FCM.

---

## Response

### Success Response — Register Device (201 Created)

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "data": {
    "deviceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "ACTIVE"
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/devices"
}
```

### Success Response — Update Device (200 OK)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource updated successfully",
  "data": {
    "deviceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "ACTIVE"
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/devices"
}
```

### Success Response — Unregister / Heartbeat (200 OK)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource updated successfully",
  "data": {
    "success": true
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/devices"
}
```

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource updated successfully",
  "data": {
    "success": true
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/devices/heartbeat"
}
```

### Response Data Schema

**Register / Update (`data`)**

| Field    | Type   | Description                                           |
| -------- | ------ | ----------------------------------------------------- |
| deviceId | string | UUID của record `guest_device_tokens`                 |
| status   | string | Trạng thái token: `ACTIVE` \| `INACTIVE` \| `INVALID` |

**Unregister / Heartbeat (`data`)**

| Field   | Type    | Description                |
| ------- | ------- | -------------------------- |
| success | boolean | Luôn `true` khi thành công |

### Token Status Lifecycle

| Status     | Ý nghĩa                                                      |
| ---------- | ------------------------------------------------------------ |
| `ACTIVE`   | Token hợp lệ, nhận push notification                         |
| `INACTIVE` | Guest unregister hoặc token bị thay bởi guest/device khác    |
| `INVALID`  | FCM báo token không còn hợp lệ (backend tự đánh dấu sau gửi) |

### Error Responses

**400 Bad Request - Validation failed**

Trả về khi body không hợp lệ (thiếu field, `platform`/`locale` sai enum, `token` rỗng).

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "field": "platform",
      "constraint": "isEnum",
      "message": "platform must be a valid enum value",
      "value": "WEB"
    }
  ],
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/devices"
}
```

**401 Unauthorized - Thiếu hoặc sai token**

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Bearer token required",
  "error": "Unauthorized",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/devices"
}
```

**404 Not Found - Device token not found**

Chỉ xảy ra với `PATCH /api/devices` khi guest chưa từng đăng ký device.

```json
{
  "success": false,
  "statusCode": 404,
  "message": "Device token not found",
  "error": "Not Found",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/devices"
}
```

**429 Too Many Requests - Vượt quá rate limit**

```json
{
  "success": false,
  "statusCode": 429,
  "message": "Too Many Requests",
  "error": "Too Many Requests",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/devices"
}
```

---

## Use Cases

### Use Case 1: App mở lần đầu — đăng ký FCM token

Sau khi guest init và user cho phép notification, client lấy FCM token và đăng ký lên backend.

**Request:**

```bash
curl -X POST http://localhost:3000/api/devices \
  -H "Authorization: Bearer xK9mP2nQ7vR4sT8wY1zA3bC5dE6fG0hJ" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "dGhpcyBpcyBhIGZha2UgZmNtIHRva2Vu",
    "platform": "ANDROID",
    "locale": "VI"
  }'
```

**Response:**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "data": {
    "deviceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "ACTIVE"
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/devices"
}
```

---

### Use Case 2: FCM token refresh

Firebase refresh token → client gọi `PATCH` với token mới (giữ hoặc cập nhật `locale`).

**Request:**

```bash
curl -X PATCH http://localhost:3000/api/devices \
  -H "Authorization: Bearer xK9mP2nQ7vR4sT8wY1zA3bC5dE6fG0hJ" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "bmV3LWZjbS10b2tlbi1hZnRlci1yZWZyZXNo",
    "locale": "VI"
  }'
```

**Response:** HTTP 200 với `deviceId`, `status: "ACTIVE"`.

---

### Use Case 3: User đổi ngôn ngữ trong app

Client cập nhật `locale` để push notification hiển thị đúng ngôn ngữ (backend resolve i18n từ `locale` trên device record).

**Request:**

```bash
curl -X PATCH http://localhost:3000/api/devices \
  -H "Authorization: Bearer xK9mP2nQ7vR4sT8wY1zA3bC5dE6fG0hJ" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "dGhpcyBpcyBhIGZha2UgZmNtIHRva2Vu",
    "locale": "EN"
  }'
```

**Response:** HTTP 200.

---

### Use Case 4: App resume — heartbeat

Khi app quay lại foreground, client gửi heartbeat để cập nhật `lastSeenAt`.

**Request:**

```bash
curl -X PATCH http://localhost:3000/api/devices/heartbeat \
  -H "Authorization: Bearer xK9mP2nQ7vR4sT8wY1zA3bC5dE6fG0hJ"
```

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource updated successfully",
  "data": {
    "success": true
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/devices/heartbeat"
}
```

---

### Use Case 5: User tắt push / logout — unregister

Client gọi `DELETE` để backend không gửi push tới token này nữa.

**Request:**

```bash
curl -X DELETE http://localhost:3000/api/devices \
  -H "Authorization: Bearer xK9mP2nQ7vR4sT8wY1zA3bC5dE6fG0hJ"
```

**Response:** HTTP 200 với `data.success: true`.

---

### Use Case 6: Cài lại app — guest mới, token cũ bị inactive

1. User uninstall → cài lại → `POST /api/guest/init` tạo guest mới.
2. App lấy FCM token (có thể trùng token cũ trên cùng thiết bị).
3. `POST /api/devices` với guest mới → token gắn guest mới; record cũ (guest cũ) bị `INACTIVE` nếu cùng `token`.

---

## Security Considerations

1. **Bearer authentication**: Mọi endpoint yêu cầu `GuestAuthGuard` — chỉ guest sở hữu token mới quản lý được device của mình.
2. **Game isolation**: `gameId` lấy từ token, không từ body — ngăn cross-game device registration.
3. **Token uniqueness**: `token` unique toàn DB — một FCM token chỉ active cho một guest tại một thời điểm.
4. **Rate limiting**: 10 requests/60s per guest — chống spam register/update.
5. **No web platform**: Chỉ hỗ trợ `IOS` và `ANDROID` — không có `WEB` trong enum.
6. **FCM invalidation**: Backend tự đánh dấu `INVALID` khi FCM trả lỗi token expired/unregistered (không expose qua API).

---

## Common Errors and Solutions

### Error: "Device token not found"

**Cause**: Gọi `PATCH /api/devices` trước khi `POST /api/devices`

**Solution**: Gọi `POST /api/devices` lần đầu khi có FCM token; dùng `PATCH` chỉ khi đã register

### Error: "Bearer token required" / "Invalid token"

**Cause**: Thiếu hoặc sai Authorization header

**Solution**: Dùng `secretToken` từ `POST /api/guest/init`, format `Authorization: Bearer <token>`

### Error: Validation failed (platform/locale)

**Cause**: Gửi giá trị không thuộc enum (`WEB`, `vi` thay vì `VI`, v.v.)

**Solution**: Dùng đúng enum Prisma — `platform`: `IOS` | `ANDROID`, `locale`: `EN` | `VI` (uppercase)

### Error: Push không tới dù đã register

**Cause**: Firebase chưa cấu hình backend, token `INACTIVE`/`INVALID`, hoặc iOS chưa upload APNs key

**Solution**:

- Kiểm tra log backend: `Firebase Admin SDK initialized`
- Xem `documents/setup/environment-variables.md` (section Firebase Admin SDK)
- Xem `game-starter-kit/documents/setup/firebase-native.md` (client + APNs)
- Kiểm tra `status = ACTIVE` trong bảng `guest_device_tokens`

### Error: Rate limit exceeded

**Cause**: Quá 10 requests/phút per guest

**Solution**: Debounce heartbeat; chỉ gọi register một lần khi token thay đổi; cache `lastSyncedToken` / `pendingToken` phía client (`notification-state-v1`)

### Error: Notification sai ngôn ngữ

**Cause**: `locale` trên device record chưa cập nhật sau khi user đổi ngôn ngữ

**Solution**: Gọi `PATCH /api/devices` với `locale` mới mỗi khi đổi language trong app

---

## Related Endpoints

- **POST /api/guest/init**: Khởi tạo guest và lấy Bearer token (bắt buộc trước khi gọi Devices API)
- **POST /api/results**: Gửi kết quả game — trigger Top 100 notification qua event bus
- **GET /api/leaderboards**: Client mở màn Leaderboard khi tap push (`route: Leaderboard` — in-app navigation, không phải deeplink URL)
- **GET /api/health**: Kiểm tra server và dependencies

---

## Notes

- Global prefix `/api` (cấu hình `main.ts`).
- Response envelope qua `ResponseInterceptor`.
- Bảng DB: `guest_device_tokens` — quan hệ 1:1 với `GuestPlayer` (`@@unique([gameId, guestId])`).
- `locale` trên device record quyết định ngôn ngữ push (`EN` → en, `VI` → vi) qua `getLocalizedNotification()`.
- Push chỉ gửi tới token `ACTIVE`; `findActiveToken()` dùng khi dispatch notification.
- Saturday rank broadcast quét batch token `ACTIVE` qua BullMQ (`SATURDAY_RANK_BATCH_SIZE = 500`). Cron: `0 9 * * 6`, timezone `Asia/Ho_Chi_Minh`. Chỉ gửi cho guest **có rank** (ưu tiên Redis, fallback DB khi cache miss).
- FCM `data` payload: `{ type, route }` — client map sang Phaser scene (`Leaderboard`, `DailyReward`, `Home`).
- Client reference: `game-starter-kit/src/platform/modules/notifications/services/push-notification.service.ts`.
- Rate limit: `10/60s` per guest (`rate:device:{guestId}`).
- Web platform không hỗ trợ push — client skip gracefully khi không phải native.
