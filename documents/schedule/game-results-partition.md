# Scheduled Partition Maintenance

Tài liệu này mô tả chi tiết cron job được triển khai trong file `src/infra/maintenance/maintenance.service.ts` của dự án Game API. Tác vụ này tự động tạo partition PostgreSQL cho bảng `game_results` theo năm, đảm bảo hệ thống luôn sẵn sàng ghi dữ liệu kết quả game mà không bị lỗi thiếu partition.

## 1. ensurePartitionsForUpcomingPeriod

**Schedule:** 23:59 ngày cuối tháng (`59 23 28-31 * *`, handler `ensurePartitionsBeforeMonthBoundary` chỉ chạy khi ngày hôm sau là mùng 1). `@Cron` không đặt `timeZone`, nên lịch và phép tính “ngày mai” dùng timezone local của process/container.

**Purpose:**

- Tự động tạo partition `game_results_<YYYY>` cho **năm hiện tại** và **năm tiếp theo** nếu chưa tồn tại.
- Tránh lỗi insert khi dữ liệu `createdAt` rơi vào năm mới (hoặc năm hiện tại chưa có partition) mà chưa có partition tương ứng.
- Giữ bảng `game_results` (partition theo `createdAt`) hoạt động ổn định theo thời gian mà không cần can thiệp thủ công.

**Operation Logic:**

1. Tính `currentYear = năm hiện tại` (process-local calendar).
2. `PartitionService.ensurePartitionsForUpcomingPeriod()` gọi `ensurePartitionForYear(currentYear)` rồi `ensurePartitionForYear(currentYear + 1)`.
3. Với mỗi năm: `tableName = game_results_<YYYY>`.
4. Kiểm tra partition đã tồn tại chưa bằng query `pg_class` (`SELECT EXISTS ... WHERE relname = tableName`).
5. Nếu partition **đã tồn tại** → return im lặng (idempotent).
6. Nếu partition **chưa tồn tại** → tạo bằng raw SQL:
   - `CREATE TABLE IF NOT EXISTS game_results_<YYYY> PARTITION OF game_results`
   - `FOR VALUES FROM ('<YYYY>-01-01') TO ('<YYYY+1>-01-01')`
7. Ghi log khi tạo partition thành công.

**Startup trigger (bổ sung):**

- Ngoài cron, `MaintenanceService.onModuleInit()` cũng gọi `PartitionService.ensurePartitionsForUpcomingPeriod()`.
- Đảm bảo partition cho năm hiện tại và năm tiếp theo tồn tại ngay khi app khởi động, không cần chờ đến ngày 1 tháng sau.

**Related Fields / Tables:**

- `game_results`: bảng cha, partition theo `RANGE (createdAt)`.
- `game_results_<YYYY>`: partition con theo từng năm dương lịch.
- `createdAt`: partition key — mỗi row được route vào partition theo năm của timestamp này.
- `PARTITION_CRON`: hằng số cron `59 23 28-31 * *` trong `src/common/constants/runtime.constants.ts`.
- `ResultsRepository` gọi `PartitionService.ensurePartitionForInsertDate()` trong transaction trước khi insert — lớp bảo vệ cuối nếu cron bị lỡ.

**General Notes:**

- Prisma không hỗ trợ declarative partitioning — bảng `game_results` được chuyển qua custom SQL migration [`prisma/migrations/20260709123010_partition_game_results/migration.sql`](../../prisma/migrations/20260709123010_partition_game_results/migration.sql).
- Migration tạo partition cho mọi năm có dữ liệu cũ, năm hiện tại của PostgreSQL và ít nhất năm kế tiếp; các năm sau do `PartitionService` quản lý.
- PostgreSQL yêu cầu mọi `UNIQUE` constraint trên partitioned table phải chứa partition key — vì vậy **không thể** dùng `UNIQUE (gameId, guestId, clientResultId)`. Dedup được xử lý bằng advisory lock trong `ResultsRepository` (xem [Results API](../apis/results.md)).
- Cron constant được định nghĩa cố định trong source (`PARTITION_CRON`), không đọc từ biến môi trường.
- Chỉ việc tạo partition mới được log (`Created partition ...`); nhánh partition đã tồn tại không log.
