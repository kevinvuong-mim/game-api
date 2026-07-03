# Hướng dẫn lấy các biến môi trường

Tài liệu này hướng dẫn cách lấy các biến môi trường cần thiết cho dự án game-api.

## 1. Database

### DATABASE_URL

Đây là connection string để kết nối tới PostgreSQL database.

**Format:**

```
DATABASE_URL="postgresql://username:password@host:port/database_name"
```

**Các thành phần:**

- `password`: Mật khẩu của user
- `username`: Tên user PostgreSQL
- `port`: Cổng PostgreSQL (mặc định: `5432`)
- `database_name`: Tên database (ví dụ: `game-api`)
- `host`: Địa chỉ server database (mặc định: `localhost`)

**Ví dụ:**

```
DATABASE_URL="postgresql://kwong2000:1234abcd@localhost:5432/game-api"
```

---

## 2. Redis

### REDIS_URL

Chuỗi kết nối tới Redis.

**Format:**

```env
REDIS_URL="redis://localhost:6379"
```

## 3. Server Configuration

### PORT

Cổng mà server API sẽ chạy.

**Ví dụ:**

```
PORT=3000
```

**Lưu ý:**

- Port mặc định thường là 3000
- Đảm bảo port không bị sử dụng bởi ứng dụng khác
- Có thể thay đổi nếu cần (3001, 8000, 8080, v.v.)

### NODE_ENV

Môi trường chạy của ứng dụng.

**Các giá trị:**

- `development`: Môi trường phát triển (dev)
- `production`: Môi trường sản xuất (production)

**Ví dụ:**

```
NODE_ENV="development"
```

**Lưu ý:**

- Trong môi trường development, logging chi tiết hơn và có hot-reload
- Trong production, ứng dụng được tối ưu hóa về hiệu suất

---

## Tổng hợp - File .env hoàn chỉnh

Sau khi lấy được tất cả các biến, thêm chúng vào file `.env` của dự án:

```env
# Database
DATABASE_URL="postgresql://kwong2000:1234abcd@localhost:5432/game-api"

# Redis
REDIS_URL="redis://localhost:6379"

# Server
PORT=3000
NODE_ENV="development"
```

**Lưu ý quan trọng:**

- File `.env` chứa thông tin nhạy cảm, **KHÔNG BAO GIỜ commit lên Git**
- Đảm bảo `.env` đã được thêm vào `.gitignore`
- Sử dụng file `.env.example` để chia sẻ template với team
- Mỗi môi trường (dev, staging, production) nên có file `.env` riêng với các giá trị khác nhau

---

## Troubleshooting - Các lỗi thường gặp

### 1. Lỗi Database Connection

**Lỗi:** `Error: Can't reach database server`

**Nguyên nhân:**

- PostgreSQL chưa chạy
- DATABASE_URL sai format
- Port/host/credentials không đúng

**Giải pháp:**

```bash
# Kiểm tra PostgreSQL đang chạy
# macOS
brew services list

# Hoặc
ps aux | grep kwong2000

# Start PostgreSQL nếu chưa chạy
brew services start postgresql

# Test connection
psql -U kwong2000 -d game-api
```

### 2. Port already in use

**Lỗi:** `Error: listen EADDRINUSE: address already in use :::3000`

**Nguyên nhân:** Port 3000 đã được process khác sử dụng

**Giải pháp:**

```bash
# Tìm process đang dùng port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Hoặc đổi PORT trong .env
PORT=3001
```

### 3. Environment variables không load

**Lỗi:** `undefined` khi access `process.env.XXX`

**Nguyên nhân:**

- File `.env` không ở root folder
- Chưa install `@nestjs/config`
- Chưa import ConfigModule

**Giải pháp:**

```bash
# Kiểm tra file .env ở đúng vị trí
ls -la .env

# Restart server
npm run start:dev

# Verify variables loaded
# Trong code, log ra xem:
console.log(process.env.DATABASE_URL);
```

### 4. Database migration lỗi

**Lỗi:** `Prisma migration failed`

**Nguyên nhân:**

- DATABASE_URL chưa đúng
- Database chưa được tạo

**Giải pháp:**

```bash
# Tạo database trước
psql -U kwong2000
CREATE DATABASE game-api;
\q

# Run migration
npx prisma migrate dev

# Hoặc reset database
npx prisma migrate reset
```

### 5. Production deployment issues

**Lỗi:** Works local nhưng không work khi deploy

**Giải pháp checklist:**

- [ ] Tất cả env variables đã set trên production server
- [ ] NODE_ENV="production"
- [ ] Database accessible từ production server

---
