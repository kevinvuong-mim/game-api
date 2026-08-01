# Guest API Documentation

## Overview

API quản lý guest player (người chơi ẩn danh) cho game. Gồm hai endpoint:

1. **Khởi tạo guest** (`POST /api/guest/init`): Tạo guest mới và nhận `secretToken` — client lưu token vĩnh viễn để xác thực các request sau.
2. **Cập nhật tên hiển thị** (`PATCH /api/guest/name`): Đặt tên hiển thị trên leaderboard (yêu cầu Bearer token).

**Base URL**: `/api/guest`

---

## Endpoint: Init Guest

**Endpoint**: `POST /api/guest/init`

**Rate Limit**: 3 requests / 60 giây + 15 requests / 3600 giây (per IP)

**Authentication**: Public (không yêu cầu token)

### Request Headers

```
Content-Type: application/json
```

### Request Body

```json
{
  "gameId": "FRULOOP"
}
```

### Request Body Schema

| Field  | Type   | Required | Validation        | Description                          |
| ------ | ------ | -------- | ----------------- | ------------------------------------ |
| gameId | string | Yes      | `@IsEnum(GameId)` | Mã game hợp lệ. Hiện tại: `FRULOOP`. |

### Business Logic

1. **Validate gameId**: `@IsEnum(GameId)` trả 400 nếu game không nằm trong enum; service gọi lại `validateGameId()` sau validation.
2. **Rate limit check**: Giới hạn theo IP — `rate:init:{ip}` (3/60s) và `rate:init:h:{ip}` (15/3600s). Cả hai phải pass.
3. **Generate token**: `generateSecretToken()` — random 32 bytes, base64url.
4. **Hash token**: `hashSecretToken()` — SHA-256 hex, chỉ lưu hash vào DB.
5. **Create guest**: Insert `GuestPlayer` với `gameId` và `authTokenHash`.
6. **Return token**: Trả `secretToken` dạng plain text cho client (chỉ trả một lần duy nhất).

---

## Endpoint: Update Name

**Endpoint**: `PATCH /api/guest/name`

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
  "name": "PlayerOne"
}
```

### Request Body Schema

| Field | Type   | Required | Validation                  | Description                    |
| ----- | ------ | -------- | --------------------------- | ------------------------------ |
| name  | string | Yes      | Trim rồi MinLength: 1, MaxLength: 26 | Tên hiển thị; DTO `@Transform` trim trước validation — whitespace-only → 400. |

### Business Logic

1. **Authenticate**: `GuestAuthGuard` xác thực Bearer token (Redis cache hoặc DB lookup).
2. **Rate limit check**: Giới hạn theo `guestId` (`rate:name:{guestId}`).
3. **Validate body**: Kiểm tra `name` theo DTO validation.
4. **Update guest**: Cập nhật `GuestPlayer.name` theo `guestId` + `gameId` từ token.
5. **Return updated guest**: Trả `guestId`, `gameId`, `name`.

---

## Response

### Success Response — Init Guest (201 Created)

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "data": {
    "secretToken": "xK9mP2nQ7vR4sT8wY1zA3bC5dE6fG0hJ",
    "guestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "gameId": "FRULOOP"
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/guest/init"
}
```

**Note**: `secretToken` chỉ được trả về một lần khi init. Client phải lưu trữ an toàn (local storage / secure storage). Server chỉ lưu SHA-256 hash.

### Success Response — Update Name (200 OK)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource updated successfully",
  "data": {
    "name": "PlayerOne",
    "guestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "gameId": "FRULOOP"
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/guest/name"
}
```

### Error Responses

**400 Bad Request - Validation failed**

Trả về khi body không hợp lệ (thiếu field, sai enum, name quá dài, v.v.).

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "field": "gameId",
      "constraint": "isEnum",
      "message": "gameId must be a valid enum value"
    }
  ],
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/guest/init"
}
```

**401 Unauthorized - Thiếu hoặc sai token**

Trả về khi gọi `PATCH /api/guest/name` mà không có Bearer token hoặc token không hợp lệ.

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Bearer token required",
  "error": "Unauthorized",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/guest/name"
}
```

hoặc

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid token",
  "error": "Unauthorized",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/guest/name"
}
```

**429 Too Many Requests - Vượt quá rate limit**

```json
{
  "success": false,
  "statusCode": 429,
  "message": "Too Many Requests",
  "error": "HttpException",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/guest/init"
}
```

**503 Service Unavailable - Redis lỗi (rate limit fail-closed)**

```json
{
  "success": false,
  "statusCode": 503,
  "message": "Service Temporarily Unavailable",
  "error": "HttpException",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/guest/init"
}
```

---

## Use Cases

### Use Case 1: Game client khởi tạo guest lần đầu

Player mở game lần đầu, client gọi init để tạo identity ẩn danh.

**Request:**

```bash
curl -X POST http://localhost:3000/api/guest/init \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "FRULOOP"
  }'
```

**Response:**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "data": {
    "secretToken": "xK9mP2nQ7vR4sT8wY1zA3bC5dE6fG0hJ",
    "guestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "gameId": "FRULOOP"
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/guest/init"
}
```

---

### Use Case 2: Player đặt tên hiển thị

Sau khi init, player nhập tên để hiển thị trên leaderboard.

**Request:**

```bash
curl -X PATCH http://localhost:3000/api/guest/name \
  -H "Authorization: Bearer xK9mP2nQ7vR4sT8wY1zA3bC5dE6fG0hJ" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PlayerOne"
  }'
```

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Resource updated successfully",
  "data": {
    "name": "PlayerOne",
    "guestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "gameId": "FRULOOP"
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/guest/name"
}
```

---

### Use Case 3: Gọi update name không có token

Client quên lưu token hoặc gửi request không có header Authorization.

**Request:**

```bash
curl -X PATCH http://localhost:3000/api/guest/name \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PlayerOne"
  }'
```

**Response:**

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Bearer token required",
  "error": "Unauthorized",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/guest/name"
}
```

---

## Security Considerations

1. **Secret token one-time reveal**: `secretToken` chỉ trả về khi init. Server lưu SHA-256 hash, không thể khôi phục plain text.
2. **Bearer authentication**: `PATCH /api/guest/name` yêu cầu `Authorization: Bearer <secretToken>`.
3. **Token caching**: Sau khi xác thực, guest info được cache Redis (`auth:token:{sha256Hash}`, TTL 300s) để giảm DB load.
4. **Rate limiting**: Init giới hạn theo IP (chống spam tạo guest); update name giới hạn theo guestId.
5. **No token rotation**: Hiện tại không có endpoint refresh/rotate token — client phải bảo vệ token vĩnh viễn.

---

## Common Errors and Solutions

### Error: gameId không được hỗ trợ

**Cause**: `gameId` không nằm trong enum `GameId`

**Result**: DTO `isEnum` validation trả HTTP 400 trước khi service chạy.

**Solution**: Kiểm tra `gameId` đúng (`FRULOOP`) và đã có trong cả Prisma `GameId` lẫn `GAME_CONFIG`.

### Error: "Bearer token required"

**Cause**: Thiếu header `Authorization: Bearer ...`

**Solution**:

- Gửi token nhận được từ `POST /api/guest/init`
- Kiểm tra format header: `Bearer <token>` (có khoảng trắng sau Bearer)

### Error: "Invalid token"

**Cause**: Token không tồn tại trong DB hoặc đã bị thay đổi

**Solution**:

- Gọi lại `POST /api/guest/init` để tạo guest mới
- Kiểm tra token không bị truncate khi lưu trữ

### Error: Rate limit exceeded

**Cause**: Vượt quá 3 init/IP/phút, 15 init/IP/giờ, hoặc 10 name/guest/phút

**Solution**:

- Implement retry với backoff
- Cache guest token locally, tránh gọi init lặp lại

### Error: Validation failed (name)

**Cause**: `name` rỗng hoặc vượt quá 26 ký tự

**Solution**:

- Validate phía client trước khi submit
- Client nên trim trước khi submit; server cũng trim rồi reject nếu rỗng (MinLength 1 sau trim)

---

## Related Endpoints

- **POST /api/results**: Gửi kết quả game (yêu cầu Bearer token từ init)
- **POST /api/devices**: Đăng ký FCM token sau guest init (push notification)
- **GET /api/leaderboards**: Xem bảng xếp hạng (có thể truyền `guestId` để xem rank của mình)
- **GET /api/health**: Kiểm tra server và dependencies

---

## Notes

- Global prefix `/api` (cấu hình `main.ts`).
- Response envelope qua `ResponseInterceptor`.
- `secretToken` dài 43 ký tự base64url (32 random bytes).
- Mỗi guest gắn với một `gameId` cố định — token chỉ hợp lệ cho game đã init.
- Guest name là optional, có thể `null` trên leaderboard nếu chưa đặt tên.
- Rate limits: init `3/60s` + `15/hour` per IP, name `10/60s` per guest.
