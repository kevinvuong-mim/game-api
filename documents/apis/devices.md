# Devices API Documentation

## Overview

API quản lý một FCM token cho mỗi guest. Dữ liệu nằm trực tiếp trên `guest_players` (`fcmToken`, `devicePlatform`, `notificationLocale`) qua **`GuestRepository`** (không có `DeviceTokenRepository` / bảng device riêng).

**Base URL:** `/api/devices`  
**Authentication:** `X-Api-Key` + `Authorization: Bearer <secretToken>` cho cả ba endpoint  
**Rate limit:** 10 requests / 60 giây per guest, dùng chung key `rate:device:{guestId}` giữa POST/PATCH/DELETE  
**Validation:** global whitelist từ chối field thừa; enum phân biệt hoa/thường

## POST `/api/devices`

Đăng ký lần đầu hoặc ghi đè device hiện tại. Nest trả **201 Created**.

```json
{
  "token": "fcm-device-token",
  "platform": "ANDROID",
  "locale": "VI"
}
```

| Field      | Required | Validation                           |
| ---------- | -------- | ------------------------------------ |
| `token`    | Yes      | non-empty string, `@MaxLength(4096)` |
| `platform` | Yes      | `IOS` hoặc `ANDROID`                 |
| `locale`   | Yes      | `EN` hoặc `VI`                       |

Nếu token đã thuộc guest khác (kể cả game khác), **transaction** clear cả ba field device của owner cũ rồi gán token cho guest hiện tại. Response:

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "data": { "guestId": "uuid" },
  "timestamp": "2026-07-17T12:00:00.000Z",
  "path": "/api/devices"
}
```

## PATCH `/api/devices`

Cập nhật **cả** token và locale; hai field đều required. Platform hiện tại được giữ nguyên. Trả **200 OK**.

```json
{
  "token": "new-fcm-token",
  "locale": "EN"
}
```

Nếu guest chưa có `fcmToken`, trả `404 Device token not found`. Việc chuyển token từ guest khác có cùng semantics như POST và cũng chạy trong **`$transaction`**. `data` là `{ "guestId": "uuid" }`.

`token` trên PATCH cũng `@MaxLength(4096)`.

## DELETE `/api/devices`

Clear `fcmToken`, `devicePlatform` và `notificationLocale`. Endpoint idempotent: kể cả khi không có token, vẫn trả **200 OK**:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource deleted successfully",
  "data": { "success": true },
  "timestamp": "2026-07-17T12:00:00.000Z",
  "path": "/api/devices"
}
```

## Errors and delivery behavior

- Thiếu/sai `X-Api-Key`: **401** `Invalid API key`; `API_KEY` chưa cấu hình: **503** `API key is not configured`.
- Thiếu/sai Bearer token: 401; DTO invalid/field thừa: 400; vượt shared limit: 429; Redis lỗi trên rate limit: **503** (`Service Temporarily Unavailable`, fail-closed).
- `fcmToken` unique toàn DB. Code chủ động chuyển ownership trước update để tránh unique conflict. Nếu vẫn còn race unique, `DeviceTokenService` map `FcmTokenConflictError` → **409 Conflict**.
- Guest chưa có token khi PATCH: **404** `Device token not found`.
- FCM error `messaging/registration-token-not-registered` hoặc `messaging/invalid-registration-token` clear cả ba field device.
- Locale `VI` map sang `vi`; mọi giá trị còn lại trong delivery path fallback `en`.
- Thiếu Firebase credentials không làm device API lỗi; dữ liệu vẫn được lưu nhưng delivery bị skip.
