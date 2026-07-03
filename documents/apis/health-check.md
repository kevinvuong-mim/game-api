# Health Check API Documentation

## Overview

API kiểm tra trạng thái server và dependencies. Gồm endpoint đơn giản (`GET /api`) và health check đầy đủ (`GET /api/health`) với Postgres + Redis.

**Base URL**: `/api`

---

## Endpoints

### 1. Root Health (Hello)

**Endpoint**: `GET /api`

**Authentication**: Public

#### Response (200 OK)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": "Hello World!",
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api"
}
```

#### cURL

```bash
curl http://localhost:3000/api
```

---

### 2. Full Health Check

Kiểm tra Postgres và Redis connectivity. Dùng cho load balancer / k8s probe.

**Endpoint**: `GET /api/health`

**Authentication**: Public

#### Response (200 OK)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Data retrieved successfully",
  "data": {
    "status": "ok",
    "postgres": "up",
    "redis": "up",
    "timestamp": "2026-06-27T12:00:00.000Z"
  },
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/health"
}
```

#### Response Schema (`data`)

| Field     | Type   | Description                          |
| --------- | ------ | ------------------------------------ |
| status    | string | `ok` nếu cả Postgres và Redis up; `degraded` nếu một trong hai down |
| postgres  | string | `up` \| `down`                       |
| redis     | string | `up` \| `down`                       |
| timestamp | string | Thời điểm check (ISO 8601)           |

**Lưu ý**: HTTP status vẫn **200** khi `degraded` — client/probe cần đọc `data.status`.

#### cURL

```bash
curl http://localhost:3000/api/health
```

---

## Business Logic

- `GET /api` → `AppService.getHello()`.
- `GET /api/health` → `AppService.check()`:
  - Postgres: `SELECT 1` qua Prisma.
  - Redis: `PING`.

---

## Notes

- Global prefix `/api` (cấu hình `main.ts`).
- Response envelope qua `ResponseInterceptor`.
