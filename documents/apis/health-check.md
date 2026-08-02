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
   - Cả Postgres **và** Redis `connected` → HTTP **200**, `data.status: "ok"`.
   - Postgres hoặc Redis `disconnected` → HTTP **503**, `status: "degraded"`.
4. **Collect metadata**: Ghi `uptime` (giây) và `timestamp` (ISO 8601).
5. **Return response**: Always returns the health payload via `ResponseInterceptor`. When unhealthy, the controller sets HTTP **503** with `passthrough` (`res.status(503)`) — no `ServiceUnavailableException` / filter special-case.

> Rate limit **fail-closed**: khi Redis lỗi, các endpoint có `@RateLimit` trả **503** (`Service Temporarily Unavailable`). Guest auth vẫn fallback DB khi auth cache miss.

---

## Response

### Success Response (200 OK)

Trả về khi **cả** Postgres và Redis kết nối thành công.

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

| Field          | Type   | Description                             |
| -------------- | ------ | --------------------------------------- |
| status         | string | `ok` khi cả Postgres và Redis connected |
| services       | object | Trạng thái từng dependency              |
| services.db    | string | `connected` \| `disconnected`           |
| services.redis | string | `connected` \| `disconnected`           |
| timestamp      | string | Thời điểm health check (ISO 8601)       |
| uptime         | number | Thời gian server đã chạy (giây)         |

### Degraded Response (503 Service Unavailable)

Trả về khi Postgres và/hoặc Redis down. Controller set HTTP **503** qua `passthrough` (`res.status(503)`); payload vẫn đi qua `ResponseInterceptor` nên envelope vẫn `success: true` (không dùng `ServiceUnavailableException` / `HttpExceptionFilter`).

```json
{
  "success": true,
  "statusCode": 503,
  "message": "Data retrieved successfully",
  "data": {
    "status": "degraded",
    "services": {
      "db": "connected",
      "redis": "disconnected"
    },
    "timestamp": "2026-06-27T12:00:00.000Z",
    "uptime": 12345
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/health"
}
```

**Possible states**:

- `services.db: "disconnected"` → **503**
- `services.redis: "disconnected"` → **503** (kể cả khi Postgres OK)

---

## Use Cases

### Use Case 1: Kubernetes readiness probe

Probe nên coi **503** là not ready; **200** là ready.

```bash
curl http://localhost:3000/api/health
```

---

### Use Case 2: Monitoring phát hiện dependency down

- Postgres down → HTTP 503
- Redis down → HTTP 503

```bash
curl -i http://localhost:3000/api/health
```

---

### Use Case 3: Dev local kiểm tra stack đã sẵn sàng

```bash
curl http://localhost:3000/api/health
```

HTTP 200 với cả `services.db` và `services.redis` = `connected` là điều kiện để test API nghiệp vụ (rate limit cần Redis).

---

## Security Considerations

1. **Public endpoint**: Không yêu cầu authentication.
2. **Minimal payload**: Chỉ trả về trạng thái kết nối.
3. **No rate limit**: Cân nhắc firewall khi expose public.

---

## Common Errors and Solutions

### Error: HTTP 503 Service Unavailable

**Cause**: Postgres và/hoặc Redis không kết nối được

**Solution**:

- Kiểm tra `docker-compose` / database / redis service
- Xác minh `DATABASE_URL` và `REDIS_URL` trong `.env`
- Endpoint có `@RateLimit` cũng trả 503 khi Redis down (fail-closed)

---

## Related Endpoints

- **POST /api/guest/init**: Cần Postgres + Redis (rate limit)
- **GET /api/leaderboards**: Cần Postgres + Redis (rate limit)
- **POST /api/results**: Cần Postgres + Redis (rate limit)

---

## Notes

- Global prefix `/api` (`main.ts`).
- **Healthy (200)**: Postgres **và** Redis connected.
- **Unhealthy (503)**: Bất kỳ dependency nào disconnected.
