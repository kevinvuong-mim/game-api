# Partition maintenance

Managed by `MaintenanceService` (`PARTITION_CRON`, default `0 3 1 * *`).

Creates `game_results_<YYYY>` partition for the **next calendar year** when missing.

See `GAME_API_BUILD_SPEC.md` Sections 5 and 10.
