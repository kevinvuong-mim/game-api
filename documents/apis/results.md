# Results API Documentation

## Overview

API gửi kết quả game (batch submit). Mỗi kết quả được xác thực bằng HMAC signature để chống giả mạo điểm. Hỗ trợ dedup theo `clientResultId`, cập nhật leaderboard best score và Top 100 push.

**Base URL**: `/api/results`

---

## Endpoint

**Endpoint**: `POST /api/results`

**Rate Limit**: 20 requests / 60 giây (per guest)

**Authentication**: Required (Bearer Token)

### Request Headers

```
Authorization: Bearer <secretToken>
Content-Type: application/json
```

### Request Body

```json
{
  "gameId": "FRULOOP",
  "items": [
    {
      "clientResultId": "res-001",
      "score": 1500,
      "playedAt": "2026-01-15T10:00:00.000Z",
      "metadata": { "level": 5, "combo": 10 },
      "signature": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
    }
  ]
}
```

### Request Body Schema

| Field                  | Type   | Required | Validation                        | Description                                          |
| ---------------------- | ------ | -------- | --------------------------------- | ---------------------------------------------------- |
| gameId                 | string | Yes      | `@IsEnum(GameId)`                 | Mã game (`FRULOOP`). Phải khớp game của guest token. |
| items                  | array  | Yes      | Min: 1, Max: 50 items             | Danh sách kết quả cần gửi                            |
| items[].clientResultId | string | Yes      | Non-empty string                  | ID duy nhất do client tạo (dedup key)                |
| items[].score          | number | Yes      | Integer, Min: 0                   | Điểm số                                              |
| items[].playedAt       | string | No       | ISO 8601 strict                   | Thời điểm chơi                                       |
| items[].metadata       | object | No       | `@IsValidMetadata` (xem bên dưới) | Metadata bổ sung (flat object)                       |
| items[].signature      | string | Yes      | HMAC-SHA256 hex (64 chars)        | Chữ ký xác thực replay                               |

### Metadata Constraints (`@IsValidMetadata`)

- Flat object (không nested)
- Tối đa 10 keys
- Key length: 1–64 ký tự
- Value types: `string` (max 256 chars), `number`, `boolean`, `null`
- Tổng JSON size: tối đa 2048 bytes

### HMAC Signature

Payload phải khớp chính xác với server:

```ts
const payload = `${gameId}|${guestId}|${clientResultId}|${score}|${playedAt || ''}`;
const signature = createHmac('sha256', replaySecret).update(payload).digest('hex');
```

- `replaySecret`: Lấy từ `GAME_CONFIG[gameId].replaySecret` (64-char hex)
- `guestId`: Từ Bearer token (không gửi trong body)
- So sánh signature bằng `timingSafeEqual`

### Business Logic

1. **Authenticate**: `GuestAuthGuard` xác thực Bearer token.
2. **Rate limit check**: Giới hạn theo `guestId` (`rate:result:{guestId}`).
3. **Validate gameId**: `validateGameId()` + kiểm tra `guest.gameId === dto.gameId` (403 nếu không khớp).
4. **Verify signatures**: Các item có signature không hợp lệ được ghi vào `rejected` (không fail toàn batch).
5. **Atomic batch insert** (tất cả item hợp lệ trong một transaction):
   - Advisory lock: `pg_advisory_xact_lock` theo `(gameId, guestId, clientResultId)`.
   - Check duplicate → skip nếu `clientResultId` đã tồn tại.
   - Insert vào `game_results` nếu chưa có.
6. **Update leaderboard** (cùng transaction với insert):
   - Upsert `leaderboards.bestScore` = `GREATEST(current, newScore)`.
7. **Resolve rank**: Trả `rank` và `bestScore` trong response khi guest có entry trên leaderboard.
8. **Return summary**: `insertedCount`, `rejectedCount`, `rejected`, `rank?`, `bestScore?` trong `data` envelope.

---

## Response

### Success Response (201 Created)

Response envelope qua `ResponseInterceptor`:

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "path": "/api/results",
  "timestamp": "2026-07-09T12:00:00.000Z",
  "data": {
    "insertedCount": 2,
    "rejectedCount": 0,
    "rank": 42,
    "bestScore": 1500
  }
}
```

### Response fields (`data`)

| Field         | Type    | Description                                                                            |
| ------------- | ------- | -------------------------------------------------------------------------------------- |
| insertedCount | number  | Số item mới được insert (bỏ qua duplicate)                                             |
| rejectedCount | number  | Số item bị từ chối do signature không hợp lệ                                           |
| rejected      | array?  | Chi tiết item bị từ chối (`clientResultId`, `reason`) — chỉ có khi `rejectedCount > 0` |
| rank          | number? | Thứ hạng hiện tại trên leaderboard (khi guest có entry)                                |
| bestScore     | number? | Best score hiện tại trên leaderboard (khi guest có entry)                              |

**Note**: `insertedCount` có thể là `0` nếu tất cả items đều duplicate hoặc signature invalid — vẫn trả HTTP 201. Kiểm tra `rejectedCount` để biết số item bị từ chối do chữ ký sai.

### Error Responses

**400 Bad Request - Validation failed**

Trả về khi body không hợp lệ (thiếu field, items rỗng, > 50 items, metadata invalid, v.v.).

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "field": "items",
      "constraint": "arrayMinSize",
      "message": "items must contain at least 1 elements",
      "value": []
    }
  ],
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/results"
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
  "path": "/api/results"
}
```

**403 Forbidden - Guest không thuộc game**

Trả về khi `gameId` trong body khác với game của guest token.

```json
{
  "success": false,
  "statusCode": 403,
  "message": "Guest does not belong to this game",
  "error": "Forbidden",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/results"
}
```

**404 Not Found - Game không tồn tại**

```json
{
  "success": false,
  "statusCode": 404,
  "message": "Game \"INVALID\" not supported",
  "error": "Not Found",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/results"
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
  "path": "/api/results"
}
```

---

## Use Cases

### Use Case 1: Gửi kết quả game đơn lẻ

Player hoàn thành một ván, client gửi kết quả kèm HMAC signature.

**Request:**

```bash
curl -X POST http://localhost:3000/api/results \
  -H "Authorization: Bearer xK9mP2nQ7vR4sT8wY1zA3bC5dE6fG0hJ" \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "FRULOOP",
    "items": [
      {
        "clientResultId": "res-001",
        "score": 1500,
        "playedAt": "2026-01-15T10:00:00.000Z",
        "metadata": { "level": 5 },
        "signature": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
      }
    ]
  }'
```

**Response:**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "path": "/api/results",
  "timestamp": "2026-07-09T12:00:00.000Z",
  "data": {
    "insertedCount": 1,
    "rejectedCount": 0
  }
}
```

---

### Use Case 2: Gửi batch kết quả offline sync

Client sync nhiều kết quả đã chơi offline (tối đa 50 items/request).

**Request:**

```bash
curl -X POST http://localhost:3000/api/results \
  -H "Authorization: Bearer xK9mP2nQ7vR4sT8wY1zA3bC5dE6fG0hJ" \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "FRULOOP",
    "items": [
      { "clientResultId": "res-001", "score": 1500, "signature": "..." },
      { "clientResultId": "res-002", "score": 2000, "signature": "..." }
    ]
  }'
```

**Response:**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "path": "/api/results",
  "timestamp": "2026-07-09T12:00:00.000Z",
  "data": {
    "insertedCount": 2,
    "rejectedCount": 0
  }
}
```

---

### Use Case 3: Gửi lại kết quả đã tồn tại (dedup)

Client retry gửi cùng `clientResultId` — server skip duplicate.

**Request:**

```bash
curl -X POST http://localhost:3000/api/results \
  -H "Authorization: Bearer xK9mP2nQ7vR4sT8wY1zA3bC5dE6fG0hJ" \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "FRULOOP",
    "items": [
      {
        "clientResultId": "res-001",
        "score": 1500,
        "signature": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
      }
    ]
  }'
```

**Response:**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Resource created successfully",
  "path": "/api/results",
  "timestamp": "2026-07-09T12:00:00.000Z",
  "data": {
    "insertedCount": 0,
    "rejectedCount": 0
  }
}
```

---

### Use Case 4: Signature không hợp lệ

Client tính sai HMAC — item bị skip, không fail request.

**Request:** Gửi item với `signature` sai.

**Response:** HTTP 201 với `insertedCount: 0` (item invalid bị lọc bỏ).

---

## Security Considerations

1. **HMAC replay protection**: Mỗi kết quả phải có signature HMAC-SHA256 với `replaySecret` — chống giả mạo điểm từ client.
2. **Timing-safe comparison**: Signature verify dùng `timingSafeEqual` chống timing attack.
3. **Bearer authentication**: Chỉ guest đã init mới gửi được kết quả.
4. **Game isolation**: `guest.gameId` phải khớp `body.gameId` — ngăn cross-game submit.
5. **Atomic dedup**: Advisory lock đảm bảo không insert trùng `clientResultId` dù concurrent requests.
6. **Rate limiting**: 20 requests/60s per guest chống spam.
7. **Invalid items silently skipped**: Signature sai không báo lỗi chi tiết — tránh leak thông tin về payload format.

---

## Common Errors and Solutions

### Error: `insertedCount: 0` dù gửi items

**Cause**: Tất cả items duplicate hoặc signature invalid

**Solution**:

- Kiểm tra `clientResultId` chưa tồn tại
- Verify HMAC payload format: `gameId|guestId|clientResultId|score|playedAt`
- Đảm bảo `playedAt` trong payload khớp body (hoặc cả hai đều rỗng)
- Dùng đúng `replaySecret` cho game

### Error: "Guest does not belong to this game"

**Cause**: `gameId` trong body khác game của token

**Solution**:

- Dùng token init từ cùng `gameId`
- Không reuse token cross-game

### Error: "Bearer token required"

**Cause**: Thiếu Authorization header

**Solution**: Gửi `Authorization: Bearer <secretToken>` từ `POST /api/guest/init`

### Error: Validation failed (metadata)

**Cause**: Metadata nested, quá nhiều keys, hoặc vượt size limit

**Solution**:

- Dùng flat object, max 10 keys
- String values max 256 chars
- Total JSON max 2048 bytes

### Error: Rate limit exceeded

**Cause**: Quá 20 requests/phút per guest

**Solution**:

- Batch nhiều items trong một request (max 50)
- Implement client-side queue với backoff

---

## Related Endpoints

- **POST /api/guest/init**: Khởi tạo guest và lấy Bearer token
- **PATCH /api/guest/name**: Đặt tên hiển thị trên leaderboard
- **GET /api/leaderboards**: Xem bảng xếp hạng sau khi submit kết quả
- **POST /api/devices**: Đăng ký FCM token để nhận scheduled rank push
- **GET /api/health**: Kiểm tra server và dependencies

---

## Notes

- Global prefix `/api` (cấu hình `main.ts`).
- Response envelope qua `ResponseInterceptor` (tất cả endpoint thành công).
- Dedup dùng advisory lock, **không** dùng `ON CONFLICT` — bảng `game_results` partition theo `createdAt`.
- Leaderboard upsert: chỉ update khi `newScore > currentBestScore`.
- Response có thể gồm `rank`, `bestScore` khi guest đã có entry trên leaderboard.
- `playedAt` optional — nếu không gửi, payload HMAC dùng chuỗi rỗng cho phần playedAt.
- Rate limit: `20/60s` per guest.
- Batch size: 1–50 items per request.
