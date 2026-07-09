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
   - Postgres `connected` → HTTP **200** (service available).
   - Postgres `disconnected` → HTTP **503** (service unavailable).
   - `data.status`: `"ok"` khi cả Postgres và Redis connected; `"degraded"` khi Postgres OK nhưng Redis disconnected.
4. **Collect metadata**: Ghi `uptime` (giây) và `timestamp` (ISO 8601).
5. **Return response**: Payload được bọc qua `ResponseInterceptor` khi healthy; khi Postgres down, throw `ServiceUnavailableException` và trả error envelope qua `HttpExceptionFilter`.

> Redis down không làm API trả 503 khi Postgres OK. Rate limit và guest auth đều **fail-open** (fallback DB cho auth khi cache miss/lỗi Redis).

---

## Response

### Success Response (200 OK)

Trả về khi Postgres kết nối thành công.

**Cả Postgres và Redis connected:**

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

**Postgres connected, Redis disconnected (degraded):**

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "status": "degraded",
    "services": {
      "db": "connected",
      "redis": "disconnected"
    },
    "timestamp": "2026-06-27T12:00:00.000Z",
    "uptime": 12345
  }
}
```

### Response Data Schema (`data`)

| Field          | Type   | Description                                                        |
| -------------- | ------ | ------------------------------------------------------------------ |
| status         | string | `ok` khi cả Postgres và Redis connected; `degraded` khi Redis down |
| services       | object | Trạng thái từng dependency                                         |
| services.db    | string | `connected` \| `disconnected`                                      |
| services.redis | string | `connected` \| `disconnected`                                      |
| timestamp      | string | Thời điểm health check (ISO 8601)                                  |
| uptime         | number | Thời gian server đã chạy (giây, `process.uptime()`)                |

### Error Responses

**503 Service Unavailable - Postgres down**

Trả về khi Postgres không kết nối được.

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

**Possible states**:

- `services.db: "disconnected"` — Postgres không phản hồi → **503**
- `services.redis: "disconnected"` — Redis không phản hồi → **200** với `status: "degraded"`

---

## Use Cases

### Use Case 1: Kubernetes readiness probe

Probe nên coi **503** là not ready; **200** (kể cả `degraded`) là ready cho traffic cơ bản.

```bash
curl http://localhost:3000/api/health
```

---

### Use Case 2: Monitoring phát hiện dependency down

- Postgres down → HTTP 503
- Chỉ Redis down → HTTP 200, `data.status: "degraded"`

```bash
curl -i http://localhost:3000/api/health
```

---

### Use Case 3: Dev local kiểm tra stack đã sẵn sàng

```bash
curl http://localhost:3000/api/health
```

HTTP 200 với `services.db: "connected"` là đủ để test API nghiệp vụ.

---

## Security Considerations

1. **Public endpoint**: Không yêu cầu authentication.
2. **Minimal payload**: Chỉ trả về trạng thái kết nối.
3. **No rate limit**: Cân nhắc firewall khi expose public.

---

## Common Errors and Solutions

### Error: HTTP 503 Service Unavailable

**Cause**: Postgres không kết nối được

**Solution**:

- Kiểm tra `docker-compose` / database service
- Xác minh `DATABASE_URL` trong `.env`

### Error: HTTP 200 nhưng `status: "degraded"`

**Cause**: Redis không kết nối

**Solution**:

- Kiểm tra `REDIS_URL`, `docker-compose` redis service
- Postgres OK + Redis down → HTTP 200, `status: "degraded"`
- Rate limit và guest auth fail-open khi Redis lỗi

---

## Related Endpoints

- **POST /api/guest/init**: Cần Postgres healthy
- **GET /api/leaderboards**: Cần Postgres healthy
- **POST /api/results**: Cần Postgres healthy

---

## Notes

- Global prefix `/api` (`main.ts`).
- **Healthy (200)**: Postgres connected.
- **Unhealthy (503)**: Postgres disconnected.
- Redis chỉ ảnh hưởng `data.status` (`ok` vs `degraded`), không quyết định HTTP 503.
