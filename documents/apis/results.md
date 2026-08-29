# Results API Documentation

## Overview

API gửi kết quả game (batch submit). Dedup theo `clientResultId` ngăn cùng kết quả được ghi lại. Batch cập nhật leaderboard best score và, khi submitter từ ngoài Top 100 (rank >100 hoặc chưa có rank) đẩy guest #100 xuống rank >100, có thể gửi FCM `top_100_exited` cho guest bị đẩy ra. Không có notification “entered Top 100”. Scores trusted từ authenticated client — không có HMAC / signature.

**Base URL**: `/api/results`

---

## Endpoint

**Endpoint**: `POST /api/results`

**Rate Limit**: 20 requests / 60 giây (per guest)

**Authentication**: `X-Api-Key` + Bearer Token

### Request Headers

```
Authorization: Bearer <secretToken>
Content-Type: application/json
X-Api-Key: <API_KEY>
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
      "metadata": { "level": 5, "combo": 10 }
    }
  ]
}
```

### Request Body Schema

| Field                  | Type   | Required | Validation                                               | Description                                                    |
| ---------------------- | ------ | -------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| gameId                 | string | Yes      | `@IsEnum(GameId)`                                        | Mã game (`FRULOOP`, `MEMORA`). Phải khớp game của guest token. |
| items                  | array  | Yes      | Min: 1, Max: 50 items                                    | Danh sách kết quả cần gửi                                      |
| items[].clientResultId | string | Yes      | `@Transform(trim)` + `@IsNotEmpty()` + `@MaxLength(128)` | ID do client tạo; dùng làm dedup key trong guest/game          |
| items[].score          | number | Yes      | Integer, Min: 0, Max: 2147483647                         | Điểm số (khớp Prisma `Int` / PG `integer`)                     |
| items[].playedAt       | string | No       | ISO 8601 strict                                          | Thời điểm chơi                                                 |
| items[].metadata       | object | No       | `@IsValidMetadata` (xem bên dưới)                        | Metadata bổ sung (flat object)                                 |

### Metadata Constraints (`@IsValidMetadata`)

- Flat object (không nested)
- Tối đa 10 keys
- Key length: 1–64 ký tự
- Value types: `string` (max 256 chars), `number`, `boolean`, `null`
- `JSON.stringify(metadata).length` tối đa 2048 JavaScript code units (validator không đo UTF-8 bytes)

### Business Logic

Guards chạy trước ValidationPipe: `X-Api-Key` (global) → `GuestAuthGuard` → rate limit → DTO.

1. **Authenticate**: `GuestAuthGuard` xác thực Bearer token.
2. **Rate limit check**: Giới hạn theo `guestId` (`rate:result:{guestId}`).
3. **Validate body**: `@IsEnum(GameId)` trả 400 cho giá trị không hợp lệ; sau đó kiểm tra `guest.gameId === dto.gameId` (403 nếu không khớp).
4. **Ensure partition then atomic batch insert**:
   - `PartitionService.ensurePartitionForInsertDate()` **trước** transaction (DDL không nằm trong TX submit).
   - Transaction timeout 30s (`SUBMIT_RESULT_TX`).
   - Advisory lock: `pg_advisory_xact_lock` theo `(gameId, guestId, clientResultId)`.
   - Check duplicate → skip nếu `clientResultId` đã tồn tại.
   - Insert vào `game_results` nếu chưa có.
5. **Update leaderboard** (cùng transaction với insert):
   - Nếu candidate score **không** phải best mới: không lấy lock toàn game, không snapshot #100; chỉ trả rank hiện tại.
   - Nếu là best mới: per-game advisory lock. Nếu submitter **đã** ở rank ≤100, upsert `bestScore` và bỏ snapshot #100 (nhảy trong Top 100 không đẩy #100 ra). Nếu chưa có rank hoặc rank >100: snapshot guest #100, rồi upsert.
6. **Top 100 exit (optional FCM)**: Chỉ khi batch tạo best score mới **và** snapshot #100 được lấy (submitter vào từ ngoài Top 100). Sau upsert, resolve rank của guest #100 cũ. `ResultsService` gọi trực tiếp `NotificationDeliveryService.sendTop100Exited` (fire-and-forget) khi displaced guest rank >100. `TOP_100_THRESHOLD` là cutoff **rank**, không phải score. Submitter không nhận exit — `bestScore` chỉ tăng.
7. **Resolve rank**: Prefer `currentRank`/`newBest` từ submit TX; trả `rank` và `bestScore` khi guest có entry trên leaderboard.
8. **Return summary**: `insertedCount`, `rank?`, `bestScore?` trong `data` envelope.

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
    "rank": 42,
    "bestScore": 1500
  }
}
```

### Response fields (`data`)

| Field         | Type    | Description                                               |
| ------------- | ------- | --------------------------------------------------------- |
| insertedCount | number  | Số item mới được insert (bỏ qua duplicate)                |
| rank          | number? | Thứ hạng hiện tại trên leaderboard (khi guest có entry)   |
| bestScore     | number? | Best score hiện tại trên leaderboard (khi guest có entry) |

**Note**: `insertedCount` có thể là `0` nếu tất cả items đều duplicate — vẫn trả HTTP 201. `rank` và `bestScore` chỉ có khi guest đã có entry trên leaderboard.

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

**401 Unauthorized - Invalid API key**

Thiếu hoặc sai `X-Api-Key` → `401` `Invalid API key`. `API_KEY` chưa cấu hình → `503` `API key is not configured`.

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

Player hoàn thành một ván, client gửi kết quả.

**Request:**

```bash
curl -X POST http://localhost:3000/api/results \
  -H "Authorization: Bearer xK9mP2nQ7vR4sT8wY1zA3bC5dE6fG0hJ" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <API_KEY>" \
  -d '{
    "gameId": "FRULOOP",
    "items": [
      {
        "clientResultId": "res-001",
        "score": 1500,
        "playedAt": "2026-01-15T10:00:00.000Z",
        "metadata": { "level": 5 }
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
  -H "X-Api-Key: <API_KEY>" \
  -d '{
    "gameId": "FRULOOP",
    "items": [
      { "clientResultId": "res-001", "score": 1500 },
      { "clientResultId": "res-002", "score": 2000 }
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
  -H "X-Api-Key: <API_KEY>" \
  -d '{
    "gameId": "FRULOOP",
    "items": [
      {
        "clientResultId": "res-001",
        "score": 1500
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
    "rank": 42,
    "bestScore": 1500
  }
}
```

---

## Security Considerations

1. **API key + Bearer**: Mọi request cần `X-Api-Key`; chỉ guest đã init mới gửi được kết quả.
2. **Game isolation**: `guest.gameId` phải khớp `body.gameId` — ngăn cross-game submit.
3. **Atomic dedup**: Advisory lock đảm bảo không insert trùng `clientResultId` dù concurrent requests.
4. **Rate limiting**: 20 requests/60s per guest chống spam.

---

## Common Errors and Solutions

### Error: `insertedCount: 0` dù gửi items

**Cause**: Tất cả items duplicate

**Solution**:

- Kiểm tra `clientResultId` chưa tồn tại trên server
- Dùng ID mới cho mỗi ván chơi thực sự

### Error: "Guest does not belong to this game"

**Cause**: `gameId` trong body khác game của token

**Solution**:

- Dùng token init từ cùng `gameId`
- Không reuse token cross-game

### Error: "Bearer token required"

**Cause**: Thiếu Authorization header

**Solution**: Gửi `Authorization: Bearer <secretToken>` từ `POST /api/guest/init` (kèm `X-Api-Key`)

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
- Rate limit: `20/60s` per guest.
- Batch size: 1–50 items per request.
