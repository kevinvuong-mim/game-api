# Results API Documentation

## Overview

API gửi kết quả game (batch submit). Mỗi kết quả được xác thực bằng HMAC signature; dedup theo `clientResultId` ngăn cùng kết quả được ghi lại. Batch cập nhật leaderboard best score và, khi một guest từ ngoài Top 100 đi vào Top 100, có thể phát FCM `top_100_exited` cho guest từng đứng #100 và vừa bị đẩy ra. Không có notification “entered Top 100”.

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

| Field                  | Type   | Required | Validation                                               | Description                                                              |
| ---------------------- | ------ | -------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| gameId                 | string | Yes      | `@IsEnum(GameId)`                                        | Mã game (`FRULOOP`). Phải khớp game của guest token.                     |
| items                  | array  | Yes      | Min: 1, Max: 50 items                                    | Danh sách kết quả cần gửi                                                |
| items[].clientResultId | string | Yes      | `@Transform(trim)` + `@IsNotEmpty()` + `@MaxLength(128)` | ID do client tạo; dùng làm dedup key trong guest/game                    |
| items[].score          | number | Yes      | Integer, Min: 0, Max: 2147483647                         | Điểm số (khớp Prisma `Int` / PG `integer`)                               |
| items[].playedAt       | string | No       | ISO 8601 strict                                          | Thời điểm chơi                                                           |
| items[].metadata       | object | No       | `@IsValidMetadata` (xem bên dưới)                        | Metadata bổ sung (flat object)                                           |
| items[].signature      | string | Yes      | `@Matches(/^[0-9a-f]{64}$/i)` + HMAC verify in service   | Hex SHA-256 64 ký tự (case-insensitive ở DTO; service so sánh lowercase) |

### Metadata Constraints (`@IsValidMetadata`)

- Flat object (không nested)
- Tối đa 10 keys
- Key length: 1–64 ký tự
- Value types: `string` (max 256 chars), `number`, `boolean`, `null`
- `JSON.stringify(metadata).length` tối đa 2048 JavaScript code units (validator không đo UTF-8 bytes)

### HMAC Signature

Payload phải khớp chính xác với server:

```ts
const metadataPart = metadata
  ? JSON.stringify(
      Object.keys(metadata)
        .sort()
        .reduce<Record<string, string | number | boolean | null>>((acc, key) => {
          acc[key] = metadata[key];
          return acc;
        }, {}),
    )
  : '';
const payload = `${gameId}|${guestId}|${clientResultId}|${score}|${playedAt || ''}|${metadataPart}`;
const signature = createHmac('sha256', replaySecret).update(payload).digest('hex');
```

- `replaySecret`: Lấy từ `GAME_CONFIG[gameId].replaySecret` (64-char **lowercase** hex)
- `guestId`: Từ Bearer token (không gửi trong body)
- `metadata`: optional; nếu có thì serialize canonical (keys sorted) và ghép vào payload. Thiếu metadata → segment rỗng.
- So sánh signature bằng `timingSafeEqual` sau khi normalize received về lowercase

### Business Logic

1. **Authenticate**: `GuestAuthGuard` xác thực Bearer token.
2. **Rate limit check**: Giới hạn theo `guestId` (`rate:result:{guestId}`).
3. **Validate gameId**: `@IsEnum(GameId)` trả 400 cho giá trị không hợp lệ; sau đó kiểm tra `guest.gameId === dto.gameId` (403 nếu không khớp).
4. **Verify signatures**: Các item có signature không hợp lệ được ghi vào `rejected` (không fail toàn batch).
5. **Atomic batch insert** (tất cả item hợp lệ trong một transaction):
   - Advisory lock: `pg_advisory_xact_lock` theo `(gameId, guestId, clientResultId)`.
   - Check duplicate → skip nếu `clientResultId` đã tồn tại.
   - Insert vào `game_results` nếu chưa có.
6. **Update leaderboard** (cùng transaction với insert):
   - Upsert `leaderboards.bestScore` = `GREATEST(current, newScore)`.
7. **Track Top 100**: Chỉ khi batch insert ít nhất một item và tạo best score mới cao hơn best cũ. Nếu submitter đi từ ngoài vào Top 100, guest ở #100 trước update được resolve lại; nếu đã xuống >100 thì phát event exit cho guest đó. Tracker cũng phát exit cho submitter nếu snapshot trước là ≤100 nhưng rank resolve sau update là >100 (own score không làm rank xấu đi, nhưng thay đổi concurrent có thể).
8. **Resolve rank**: Trả `rank` và `bestScore` khi guest có entry trên leaderboard.
9. **Return summary**: `insertedCount`, `rejectedCount`, `rejected`, `rank?`, `bestScore?` trong `data` envelope.

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
      "message": "items must contain at least 1 elements"
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

**429 Too Many Requests - Vượt quá rate limit**

```json
{
  "success": false,
  "statusCode": 429,
  "message": "Too Many Requests",
  "error": "HttpException",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/results"
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
    "rejectedCount": 0,
    "rank": 42,
    "bestScore": 1500
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
    "rejectedCount": 0,
    "rank": 20,
    "bestScore": 2000
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
    "rejectedCount": 0,
    "rank": 42,
    "bestScore": 1500
  }
}
```

---

### Use Case 4: Signature không hợp lệ

Client tính sai HMAC — item bị skip, không fail request.

**Request:** Gửi item với `signature` sai.

**Response:** HTTP 201 với `insertedCount: 0`, `rejectedCount: 1`, và `rejected: [{"clientResultId":"...","reason":"invalid_signature"}]`. Nếu guest đã có leaderboard entry, response vẫn kèm rank hiện tại.

---

## Security Considerations

1. **HMAC verification**: Mỗi kết quả phải có signature HMAC-SHA256 với `replaySecret` (payload gồm cả canonical metadata). Vì client cũng cần secret, đây **không phải anti-cheat** — chỉ soft integrity / chống tamper fields; replay của cùng ID được chặn bằng dedup.
2. **Timing-safe comparison**: Signature verify dùng `timingSafeEqual` chống timing attack.
3. **Bearer authentication**: Chỉ guest đã init mới gửi được kết quả.
4. **Game isolation**: `guest.gameId` phải khớp `body.gameId` — ngăn cross-game submit.
5. **Atomic dedup**: Advisory lock đảm bảo không insert trùng `clientResultId` dù concurrent requests.
6. **Rate limiting**: 20 requests/60s per guest chống spam.
7. **Invalid items are rejected per item**: Request vẫn thành công nhưng response liệt kê `clientResultId` và reason `invalid_signature`.

---

## Common Errors and Solutions

### Error: `insertedCount: 0` dù gửi items

**Cause**: Tất cả items duplicate hoặc signature invalid

**Solution**:

- Kiểm tra `clientResultId` chưa tồn tại
- Verify HMAC payload format: `gameId|guestId|clientResultId|score|playedAt|canonicalMetadata`
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
- `JSON.stringify(metadata).length` tối đa 2048 (không phải byte count)

### Error: Rate limit exceeded

**Cause**: Quá 20 requests/60s per guest

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
