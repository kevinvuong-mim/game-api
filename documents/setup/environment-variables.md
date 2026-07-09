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

## 4. Firebase Admin SDK (Push Notifications)

Backend dùng **Firebase Admin SDK** để gửi FCM push notification tới thiết bị native. Ba biến sau lấy từ **Service Account** của cùng Firebase project mà client dùng (`google-services.json` / `GoogleService-Info.plist`).

> Hướng dẫn cấu hình phía client: `game-starter-kit/documents/setup/firebase-native.md`

### Cách lấy credentials

1. Mở [Firebase Console](https://console.firebase.google.com/) → chọn project (cùng project với app mobile)
2. Vào **Project settings** (biểu tượng bánh răng) → tab **Service accounts**
3. Chọn **Firebase Admin SDK** → nhấn **Generate new private key** → **Generate key**
4. Tải file JSON (ví dụ: `game-starter-kit-firebase-adminsdk-xxxxx.json`)

File JSON có dạng:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "...",
  "universe_domain": "googleapis.com"
}
```

Map các field JSON sang biến môi trường:

| Biến `.env`             | Field trong JSON |
| ----------------------- | ---------------- |
| `FIREBASE_PROJECT_ID`   | `project_id`     |
| `FIREBASE_CLIENT_EMAIL` | `client_email`   |
| `FIREBASE_PRIVATE_KEY`  | `private_key`    |

### FIREBASE_PROJECT_ID

ID của Firebase project.

**Lấy từ:**

- Field `project_id` trong file Service Account JSON, hoặc
- Firebase Console → **Project settings** → **General** → **Project ID**

**Ví dụ:**

```env
FIREBASE_PROJECT_ID=game-starter-kit-prod
```

**Lưu ý:** Phải trùng `project_id` với client (`VITE_FIREBASE_PROJECT_ID` và native config files).

### FIREBASE_CLIENT_EMAIL

Email của Service Account dùng để xác thực Admin SDK.

**Lấy từ:** field `client_email` trong file JSON.

**Ví dụ:**

```env
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-abc12@game-starter-kit-prod.iam.gserviceaccount.com
```

### FIREBASE_PRIVATE_KEY

Private key của Service Account (dạng PEM).

**Lấy từ:** field `private_key` trong file JSON.

**Cách ghi vào `.env`:**

Trong file JSON, private key có ký tự xuống dòng `\n`. Khi copy vào `.env`, giữ nguyên dạng **một dòng** và thay mỗi xuống dòng thật bằng chuỗi `\n`:

```env
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

**Lưu ý:**

- Luôn bọc trong dấu ngoặc kép `"..."` vì giá trị chứa ký tự đặc biệt
- Backend tự chuyển `\\n` thành xuống dòng thật khi khởi tạo Firebase Admin SDK
- **Không commit** file JSON gốc hoặc private key lên Git
- Mỗi môi trường (dev/staging/production) nên dùng Service Account riêng hoặc project Firebase riêng

### Hành vi khi thiếu cấu hình

Nếu **thiếu bất kỳ** biến nào trong ba biến trên, backend vẫn chạy bình thường nhưng **tắt push notification**. Log sẽ có:

```
Firebase is not configured — push notifications are disabled
```

Các API device token (`POST /api/devices`, v.v.) vẫn hoạt động; chỉ bước gửi FCM bị bỏ qua.

### Kiểm tra sau khi cấu hình

1. Khởi động lại server: `npm run start:dev`
2. Xác nhận log: `Firebase Admin SDK initialized`
3. Đăng ký device token từ app native (xem `documents/apis/devices.md`)
4. Trigger notification (ví dụ: vào/ra Top 100) hoặc đợi cron theo `GAME_CONFIG.rankPushCron` (FRULOOP mặc định: 9:00 Thứ 7 VN) — chỉ game có field và guest có rank

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

# Firebase Admin SDK
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
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

### 6. Firebase / Push notification không gửi được

**Triệu chứng:** Log `Firebase is not configured — push notifications are disabled` hoặc push không tới thiết bị

**Nguyên nhân thường gặp:**

- Thiếu hoặc sai một trong ba biến `FIREBASE_*`
- `FIREBASE_PRIVATE_KEY` bị mất xuống dòng / thiếu dấu ngoặc kép trong `.env`
- Backend dùng Firebase project khác với client
- Device token chưa đăng ký (`POST /api/devices`)
- iOS: chưa upload APNs key (.p8) lên Firebase Console

**Giải pháp:**

```bash
# Kiểm tra biến đã load (không log private key ra production)
npm run start:dev
# Tìm log: "Firebase Admin SDK initialized"

# Kiểm tra device token trên DB
# Bảng guest_players — cột fcmToken IS NOT NULL

# Test gửi thủ công từ Firebase Console → Messaging → Send test message
```

**Lỗi private key:**

```
Error: Failed to parse private key
```

→ Kiểm tra `FIREBASE_PRIVATE_KEY` có bọc `"..."` và dùng `\n` thay xuống dòng thật.

---
