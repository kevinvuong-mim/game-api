# Scheduled Partition Maintenance

Tài liệu này mô tả chi tiết cron job được triển khai trong file `src/modules/maintenance/maintenance.service.ts` của dự án Game API. Tác vụ này tự động tạo partition PostgreSQL cho bảng `game_results` theo năm, đảm bảo hệ thống luôn sẵn sàng ghi dữ liệu kết quả game mà không bị lỗi thiếu partition.

## 1. ensurePartitions

**Schedule:** Ngày 1 mỗi tháng lúc 3:00 sáng (`0 3 1 * *`)

**Purpose:**

- Tự động tạo partition `game_results_<YYYY>` cho **năm hiện tại** và **năm tiếp theo** nếu chưa tồn tại.
- Tránh lỗi insert khi dữ liệu `createdAt` rơi vào năm mới (hoặc năm hiện tại chưa có partition) mà chưa có partition tương ứng.
- Giữ bảng `game_results` (partition theo `createdAt`) hoạt động ổn định theo thời gian mà không cần can thiệp thủ công.

**Operation Logic:**

1. Tính `currentYear = năm hiện tại`.
2. Gọi `ensurePartitionForYear(currentYear)` rồi `ensurePartitionForYear(currentYear + 1)`.
3. Với mỗi năm: `tableName = game_results_<YYYY>`.
4. Kiểm tra partition đã tồn tại chưa bằng query `pg_class` (`SELECT EXISTS ... WHERE relname = tableName`).
5. Nếu partition **đã tồn tại** → ghi log và skip (idempotent).
6. Nếu partition **chưa tồn tại** → tạo bằng raw SQL:
   - `CREATE TABLE game_results_<YYYY> PARTITION OF game_results`
   - `FOR VALUES FROM ('<YYYY>-01-01') TO ('<YYYY+1>-01-01')`
7. Ghi log khi tạo partition thành công.

**Startup trigger (bổ sung):**

- Ngoài cron, `MaintenanceService` cũng gọi `ensurePartitions()` trong `onModuleInit()`.
- Đảm bảo partition cho năm hiện tại và năm tiếp theo tồn tại ngay khi app khởi động, không cần chờ đến ngày 1 tháng sau.

**Related Fields / Tables:**

- `game_results`: bảng cha, partition theo `RANGE (createdAt)`.
- `game_results_<YYYY>`: partition con theo từng năm dương lịch.
- `createdAt`: partition key — mỗi row được route vào partition theo năm của timestamp này.
- `PARTITION_CRON`: hằng số cron `0 3 1 * *` trong `src/common/constants/runtime.constants.ts`.

**General Notes:**

- Prisma không hỗ trợ declarative partitioning — bảng `game_results` được chuyển sang partitioned table qua custom SQL migration (`prisma/migrations/..._partition_game_results/migration.sql`).
- Partition đầu tiên (ví dụ `game_results_2026`) được tạo trong migration; các năm sau do `MaintenanceService` quản lý.
- PostgreSQL yêu cầu mọi `UNIQUE` constraint trên partitioned table phải chứa partition key — vì vậy **không thể** dùng `UNIQUE (gameId, guestId, clientResultId)`. Dedup được xử lý bằng advisory lock trong `ResultsRepository` (xem `documents/apis/results.md`).
- Cron constant được định nghĩa cố định trong source (`PARTITION_CRON`), không đọc từ biến môi trường.
- Mỗi lần chạy đều ghi log (`Partition ... already exists` hoặc `Created partition ...`) để tiện giám sát và debug.
