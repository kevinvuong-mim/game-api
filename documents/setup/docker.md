# Hướng dẫn sử dụng Docker cho Database và Redis

Tài liệu hướng dẫn chạy PostgreSQL và Redis bằng Docker cho dự án api-starter-kit.

## Yêu cầu

- Docker + Docker Compose

## Cấu hình Docker Compose

File `docker-compose.yml` ở thư mục gốc:

```yaml
version: '3.8'

services:
  postgres:
    ports:
      - '5432:5432'
    restart: unless-stopped
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: game-api
      POSTGRES_USER: kwong2000
      POSTGRES_PASSWORD: 1234abcd
    container_name: postgres-database
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      retries: 5
      timeout: 5s
      interval: 10s
      test: ['CMD-SHELL', 'pg_isready -U kwong2000 -d game-api']

  redis:
    ports:
      - '6379:6379'
    restart: unless-stopped
    image: redis:8.6-alpine
    container_name: redis-cache
    volumes:
      - redis_data:/data
    healthcheck:
      retries: 5
      timeout: 5s
      interval: 10s
      test: ['CMD', 'redis-cli', 'ping']

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
```

### Thông tin kết nối (development)

| Service    | Host      | Port | Credentials                             |
| ---------- | --------- | ---- | --------------------------------------- |
| PostgreSQL | localhost | 5432 | `kwong2000` / `1234abcd`, DB `game-api` |
| Redis      | localhost | 6379 | Không password (local dev)              |

**`.env` tương ứng:**

```env
DATABASE_URL="postgresql://kwong2000:1234abcd@localhost:5432/game-api"
REDIS_URL="redis://localhost:6379"
```

> Đổi `1234abcd` trước khi deploy. Không dùng credential mặc định trên production.

---

## Sử dụng

### Khởi động

```bash
docker-compose up -d
```

### Kiểm tra

```bash
docker-compose ps
docker-compose exec redis redis-cli ping
docker-compose exec postgres pg_isready -U kwong2000 -d game-api
```

### Dừng

```bash
docker-compose stop      # giữ data
docker-compose down      # xóa container, giữ volume
docker-compose down -v   # xóa cả data
```

### Migrate database

```bash
npm run prisma:migrate
npm run prisma:generate
```

---

## PostgreSQL CLI

```bash
docker-compose exec postgres psql -U kwong2000 -d game-api
```

```sql
\dt
SELECT * FROM games;
\q
```

---

## Redis CLI

```bash
docker-compose exec redis redis-cli
KEYS lb:global:*
ZREVRANGE lb:global:puzzle-quest 0 9 WITHSCORES
```

---

## Backup / Restore

```bash
docker-compose exec postgres pg_dump -U kwong2000 game > backup.sql
docker-compose exec -T postgres psql -U kwong2000 game < backup.sql
```

---

## Troubleshooting

### Port đã được sử dụng

Đổi port mapping trong `docker-compose.yml` (ví dụ `5433:5432`) và cập nhật `DATABASE_URL`.

### Healthcheck unhealthy

```bash
docker-compose logs postgres
docker-compose exec postgres pg_isready -U kwong2000 -d game-api
```

---

## Security

- Credential `1234abcd` chỉ cho **local development**.
- Không expose port 5432/6379 ra internet.
- Production: managed DB (RDS, Cloud SQL, …) + Redis có auth/TLS.
