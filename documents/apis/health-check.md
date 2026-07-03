# Health Check API Documentation

## Overview

API kiểm tra trạng thái server và các dependency (Postgres, Redis). Dùng cho load balancer, Kubernetes liveness/readiness probe và monitoring.

**Base URL**: `/api`

---

## Endpoint

**Endpoint**: `GET /api/health`

**Rate Limit**: Không áp dụng

**Authentication**: Public (không yêu cầu token)

### Request Headers

Không bắt buộc. Có thể gửi `Accept: application/json` nếu client cần.

### Request Body

Không có (GET request).

### Business Logic

1. **Check Postgres**: Thực thi `SELECT 1` qua Prisma (`AppService.checkPostgres()`).
2. **Check Redis**: Gửi `PING` qua Redis client (`AppService.checkRedis()`).
3. **Evaluate health**:
   - Cả Postgres và Redis `connected` → `status: "ok"`, HTTP **200**.
   - Một hoặc cả hai `disconnected` → `status: "degraded"`, HTTP **503**.
4. **Collect metadata**: Ghi `uptime` (giây) và `timestamp` (ISO 8601).
5. **Return response**: Payload được bọc qua `ResponseInterceptor` khi healthy; khi degraded, throw `ServiceUnavailableException` và trả error envelope qua `HttpExceptionFilter`.

---

## Response

### Success Response (200 OK)

Trả về khi cả Postgres và Redis đều kết nối thành công.

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "status": "ok",
    "services": {
      "db": "connected",
      "redis": "connected"
    },
    "timestamp": "2026-06-27T12:00:00.000Z",
    "uptime": 12345
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/health"
}
```

### Response Data Schema (`data`)

| Field          | Type   | Description                                                                  |
| -------------- | ------ | ---------------------------------------------------------------------------- |
| status         | string | `ok` khi cả Postgres và Redis connected; `degraded` khi một hoặc cả hai down |
| services       | object | Trạng thái từng dependency                                                   |
| services.db    | string | `connected` \| `disconnected`                                                |
| services.redis | string | `connected` \| `disconnected`                                                |
| timestamp      | string | Thời điểm health check (ISO 8601)                                            |
| uptime         | number | Thời gian server đã chạy (giây, `process.uptime()`)                          |

### Error Responses

**503 Service Unavailable - Dependency degraded**

Trả về khi Postgres hoặc Redis (hoặc cả hai) không kết nối được.

```json
{
  "success": false,
  "statusCode": 503,
  "message": "Service Unavailable",
  "error": "Service Unavailable",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/health"
}
```

**Lưu ý**: Response body của 503 có thể chứa thêm chi tiết `status`, `services`, `uptime`, `timestamp` trong payload exception tùy cấu hình NestJS. Client/probe nên kiểm tra HTTP status code **503** để xác định unhealthy.

**Possible degraded states**:

- `services.db: "disconnected"` — Postgres không phản hồi
- `services.redis: "disconnected"` — Redis không phản hồi
- Cả hai `disconnected` — Toàn bộ dependencies down

---

## Use Cases

### Use Case 1: Kubernetes readiness probe

Load balancer hoặc K8s probe gọi định kỳ để xác định pod có sẵn sàng nhận traffic.

**Request:**

```bash
curl http://localhost:3000/api/health
```

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "status": "ok",
    "services": {
      "db": "connected",
      "redis": "connected"
    },
    "timestamp": "2026-06-27T12:00:00.000Z",
    "uptime": 3600
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/health"
}
```

---

### Use Case 2: Monitoring phát hiện dependency down

Hệ thống monitoring poll endpoint và nhận 503 khi Redis hoặc Postgres gặp sự cố.

**Request:**

```bash
curl -i http://localhost:3000/api/health
```

**Response:**

```
HTTP/1.1 503 Service Unavailable
```

```json
{
  "success": false,
  "statusCode": 503,
  "message": "Service Unavailable",
  "error": "Service Unavailable",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/health"
}
```

---

### Use Case 3: Dev local kiểm tra stack đã sẵn sàng

Developer khởi động `docker-compose` và xác nhận API + dependencies hoạt động trước khi test các endpoint khác.

**Request:**

```bash
curl http://localhost:3000/api/health
```

**Response:** HTTP 200 với `data.status: "ok"` khi Postgres và Redis đã up.

---

## Security Considerations

1. **Public endpoint**: Không yêu cầu authentication — phù hợp cho probe/monitoring nhưng không nên expose thông tin nhạy cảm.
2. **Minimal payload**: Chỉ trả về trạng thái kết nối (`connected`/`disconnected`), không lộ connection string hay credential.
3. **No rate limit**: Endpoint không bị throttle — cần cân nhắc khi expose ra internet công khai (dùng internal network hoặc firewall).
4. **Helmet & CORS**: Server áp dụng `helmet` và CORS global; health check vẫn accessible qua GET.

---

## Common Errors and Solutions

### Error: HTTP 503 Service Unavailable

**Cause**: Postgres hoặc Redis không kết nối được

**Solution**:

- Kiểm tra `docker-compose` / database service đang chạy
- Xác minh `DATABASE_URL` và Redis config trong `.env`
- Chạy `SELECT 1` thủ công trên Postgres và `PING` trên Redis

### Error: Connection refused / timeout

**Cause**: API server chưa start hoặc sai port

**Solution**:

- Xác nhận server đang chạy (`npm run start:dev`)
- Kiểm tra `PORT` (mặc định `3000`)
- Gọi đúng global prefix `/api/health`

### Error: 200 nhưng app endpoint khác vẫn lỗi

**Cause**: Health chỉ check Postgres + Redis, không kiểm tra business logic hay game config

**Solution**:

- Health OK không đảm bảo toàn bộ tính năng hoạt động
- Kiểm tra thêm endpoint nghiệp vụ (guest init, leaderboard, v.v.)

---

## Related Endpoints

- **POST /api/guest/init**: Khởi tạo guest session (cần Postgres + Redis healthy)
- **GET /api/leaderboards**: Lấy bảng xếp hạng (cần Postgres + Redis healthy)
- **POST /api/results**: Gửi kết quả game (cần Postgres + Redis healthy)

---

## Notes

- Global prefix `/api` được cấu hình trong `main.ts` (`app.setGlobalPrefix('api')`).
- Response envelope thành công được bọc qua `ResponseInterceptor`.
- Khi **healthy**: HTTP **200**, `data.status: "ok"`.
- Khi **degraded**: HTTP **503** — khác với một số health check trả 200 khi degraded; client/probe **phải** đọc HTTP status code.
- `uptime` tính bằng giây từ lúc process start (`Math.floor(process.uptime())`).
- Postgres check: `prisma.$queryRaw\`SELECT 1\``.
- Redis check: `redisService.ping()`.
