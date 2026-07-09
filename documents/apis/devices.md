# Devices API Documentation

## Overview

API quản lý FCM token theo guest. Dữ liệu device được lưu trực tiếp trong `guest_players`:

- `fcmToken`
- `devicePlatform`
- `notificationLocale`

Không còn bảng `guest_device_tokens`, không còn `status`, không có heartbeat endpoint.

Base URL: `/api/devices`  
Auth: Bearer guest token

## Endpoints

### POST `/api/devices`

Đăng ký token lần đầu hoặc ghi đè token hiện tại.

Body:

```json
{
  "token": "fcm-device-token",
  "platform": "ANDROID",
  "locale": "VI"
}
```

Response `data`:

```json
{
  "guestId": "uuid"
}
```

### PATCH `/api/devices`

Cập nhật token/locale khi token refresh hoặc đổi ngôn ngữ.

Body:

```json
{
  "token": "new-fcm-token",
  "locale": "EN"
}
```

Response `data`:

```json
{
  "guestId": "uuid"
}
```

Nếu guest chưa từng register token: `404 Device token not found`.

### DELETE `/api/devices`

Hủy đăng ký device (chỉ clear token fields, **không** set Redis mute):

- set `fcmToken = null`
- set `devicePlatform = null`
- set `notificationLocale = null`

Client tắt push qua `PATCH /api/devices/preferences` trước/sau unregister.

Response `data`:

```json
{
  "success": true
}
```

### PATCH `/api/devices/preferences`

Bật/tắt push bằng Redis mute key (không sửa cột token).

Body:

```json
{
  "enabled": false
}
```

Response `data`:

```json
{
  "success": true
}
```

## Notes

- Rate limit: `10/60s` per guest (`rate:device:{guestId}`)
- `token` là FCM token và unique toàn DB (một token chỉ thuộc một guest tại một thời điểm)
- Khi FCM trả invalid token, backend sẽ clear token của guest (set về `null`)
- Push locale resolve từ `notificationLocale` (`EN` -> `en`, `VI` -> `vi`)
