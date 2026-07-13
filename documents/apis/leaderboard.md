# Leaderboard API Documentation

## Overview

API lấy bảng xếp hạng (leaderboard) theo game. Hỗ trợ phân trang và tùy chọn lấy thứ hạng của guest hiện tại (`self`). Dữ liệu đọc trực tiếp từ PostgreSQL `leaderboards`.

**Base URL**: `/api/leaderboards`

---

## Endpoint

**Endpoint**: `GET /api/leaderboards`

**Rate Limit**: 30 requests / 60 giây (per IP)

**Authentication**: Public (không yêu cầu token)

### Request Headers

Không bắt buộc. Có thể gửi `Accept: application/json`.

### Query Parameters

```
GET /api/leaderboards?gameId=FRULOOP&page=1&limit=20&guestId=<uuid>
```

### Query Parameters Schema

| Field   | Type   | Required | Validation              | Default | Description                                       |
| ------- | ------ | -------- | ----------------------- | ------- | ------------------------------------------------- |
| gameId  | string | Yes      | Phải là `GameId` hợp lệ | -       | Mã game (`FRULOOP`)                               |
| page    | number | No       | Min: 1, integer         | `1`     | Trang hiện tại (1-based)                          |
| limit   | number | No       | Min: 1, Max: 100        | `20`    | Số entry mỗi trang (server cap tối đa 100)        |
| guestId | string | No       | UUID v4                 | -       | Guest ID để lấy rank và best score của chính mình |

### Business Logic

1. **Validate gameId**: Gọi `validateGameId()` — throw 404 nếu game không tồn tại.
2. **Rate limit check**: Giới hạn theo IP (`rate:lb:{ip}`).
3. **Pagination**: Tính `offset = (page - 1) * limit`, cap `limit` tối đa 100.
4. **Count total**: Đếm tổng entry trong bảng `leaderboards` theo `gameId`.
5. **Fetch items**: Query PostgreSQL `leaderboards` với `ORDER BY bestScore DESC, guestId ASC`, `SKIP`/`TAKE` theo pagination.
6. **Resolve names**: Batch query `GuestPlayer.name` cho các `guestId` trong trang hiện tại.
7. **Resolve self rank** (nếu có `guestId`):
   - Lấy `bestScore` của guest từ `leaderboards`.
   - `rank = countBetterRanks + 1` — đếm player có `bestScore` cao hơn **hoặc** cùng score nhưng `guestId` nhỏ hơn (khớp thứ tự list).
8. **Return response**: `gameId`, `total`, `page`, `limit`, `items`, `self`.

---

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "gameId": "FRULOOP",
    "total": 150,
    "page": 1,
    "limit": 20,
    "items": [
      {
        "rank": 1,
        "guestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "bestScore": 9999,
        "name": "PlayerOne"
      },
      {
        "rank": 2,
        "guestId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "bestScore": 8500,
        "name": null
      }
    ],
    "self": {
      "rank": 12,
      "bestScore": 5000
    }
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/leaderboards?gameId=FRULOOP&page=1&limit=20"
}
```

### Response Data Schema (`data`)

| Field             | Type           | Description                                           |
| ----------------- | -------------- | ----------------------------------------------------- |
| gameId            | string         | Mã game                                               |
| total             | number         | Tổng số player trên leaderboard                       |
| page              | number         | Trang hiện tại                                        |
| limit             | number         | Số entry mỗi trang                                    |
| items             | array          | Danh sách entry trong trang                           |
| items[].rank      | number         | Thứ hạng (1-based, theo bestScore giảm dần)           |
| items[].guestId   | string (UUID)  | ID guest                                              |
| items[].bestScore | number         | Điểm cao nhất                                         |
| items[].name      | string \| null | Tên hiển thị (null nếu guest chưa đặt tên)            |
| self              | object \| null | Rank của guest hiện tại (chỉ có khi truyền `guestId`) |
| self.rank         | number         | Thứ hạng của guest                                    |
| self.bestScore    | number         | Best score của guest                                  |

**Note**: `self` là `null` khi không truyền `guestId`, hoặc guest chưa có entry trên leaderboard.

### Error Responses

**400 Bad Request - Validation failed**

Trả về khi query params không hợp lệ (thiếu `gameId`, `page` < 1, `limit` > 100, `guestId` không phải UUID).

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "errors": [
    {
      "field": "guestId",
      "constraint": "isUuid",
      "message": "guestId must be a UUID",
      "value": "not-a-uuid"
    }
  ],
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/leaderboards?gameId=FRULOOP&guestId=invalid"
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
  "path": "/api/leaderboards?gameId=INVALID"
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
  "path": "/api/leaderboards?gameId=FRULOOP"
}
```

---

## Use Cases

### Use Case 1: Hiển thị top 20 trên màn hình leaderboard

Game client load trang đầu tiên của bảng xếp hạng.

**Request:**

```bash
curl "http://localhost:3000/api/leaderboards?gameId=FRULOOP&page=1&limit=20"
```

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "gameId": "FRULOOP",
    "total": 150,
    "page": 1,
    "limit": 20,
    "items": [
      {
        "rank": 1,
        "guestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "bestScore": 9999,
        "name": "PlayerOne"
      }
    ],
    "self": null
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/leaderboards?gameId=FRULOOP&page=1&limit=20"
}
```

---

### Use Case 2: Xem rank của chính mình

Player muốn biết mình đứng thứ mấy trong khi xem leaderboard.

**Request:**

```bash
curl "http://localhost:3000/api/leaderboards?gameId=FRULOOP&guestId=a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "gameId": "FRULOOP",
    "total": 150,
    "page": 1,
    "limit": 20,
    "items": [],
    "self": {
      "rank": 12,
      "bestScore": 5000
    }
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/leaderboards?gameId=FRULOOP&guestId=a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

---

### Use Case 3: Phân trang trang tiếp theo

User scroll xuống để xem thêm entry.

**Request:**

```bash
curl "http://localhost:3000/api/leaderboards?gameId=FRULOOP&page=2&limit=20"
```

**Response:** HTTP 200 với `page: 2`, `items` chứa rank 21–40.

---

## Security Considerations

1. **Public endpoint**: Không yêu cầu authentication — phù hợp cho hiển thị leaderboard công khai.
2. **No sensitive data**: Chỉ trả về `guestId`, `name`, `bestScore` — không lộ token hay metadata game.
3. **Rate limiting**: 30 requests/60s per IP để chống scrape/abuse.
4. **guestId optional**: Truyền `guestId` chỉ để xem self rank, không xác thực ownership — bất kỳ ai biết UUID đều có thể query rank.

---

## Common Errors and Solutions

### Error: "Game \"X\" not supported"

**Cause**: `gameId` query param không hợp lệ

**Solution**: Dùng `gameId=FRULOOP` hoặc game ID đã cấu hình

### Error: Validation failed (page/limit)

**Cause**: `page` < 1 hoặc `limit` > 100 hoặc không phải integer

**Solution**: Đảm bảo `page >= 1`, `1 <= limit <= 100`, truyền dạng số nguyên

### Error: `self` is null dù đã truyền guestId

**Cause**: Guest chưa submit kết quả nào hoặc chưa có entry trên leaderboard

**Solution**: Gọi `POST /api/results` trước để tạo best score

### Error: Slow response under load

**Cause**: Leaderboard đọc trực tiếp PostgreSQL (không có Redis cache)

**Solution**: Client cache response (game-starter-kit dùng stale-while-revalidate 60s); giảm polling frequency

### Error: Rate limit exceeded

**Cause**: Quá 30 requests/phút từ cùng IP

**Solution**: Cache response phía client, giảm polling frequency

---

## Related Endpoints

- **POST /api/guest/init**: Khởi tạo guest (lấy `guestId` cho param `self`)
- **PATCH /api/guest/name**: Đặt tên hiển thị trên leaderboard
- **POST /api/results**: Gửi kết quả game (cập nhật best score và leaderboard; có thể trigger push Top 100)
- **POST /api/devices**: Đăng ký FCM token để nhận push rank / Top 100
- **GET /api/health**: Kiểm tra server và dependencies

---

## Notes

- Global prefix `/api` (cấu hình `main.ts`).
- Response envelope qua `ResponseInterceptor`.
- Xếp hạng theo `bestScore` giảm dần; tie-break: `guestId ASC` (cùng score → guestId nhỏ hơn xếp trước).
- `name` resolve từ bảng `GuestPlayer` — có thể `null` nếu chưa gọi `PATCH /api/guest/name`.
- Rate limit: `30/60s` per IP.
- API default `limit` = 20 (max 100). Client `game-starter-kit` gọi với `limit=10` (`LEADERBOARD_LIMIT`).
