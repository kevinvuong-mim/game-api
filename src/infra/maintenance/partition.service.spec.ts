import type { PrismaService } from '@/infra/prisma/prisma.service';
import { PartitionService } from '@/infra/maintenance/partition.service';

describe('PartitionService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };
  let service: PartitionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PartitionService(prisma as unknown as PrismaService);
  });

  it('creates current and next year partitions when they are missing', async () => {
    prisma.$queryRaw.mockResolvedValue([{ exists: false }]);
    prisma.$executeRawUnsafe.mockResolvedValue(undefined);

    await service.ensurePartitionsForUpcomingPeriod(new Date('2026-08-18T00:00:00.000Z'));

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('game_results_2026');
    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain("FROM ('2026-01-01')");
    expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain('game_results_2027');
  });

  it('skips CREATE when the partition already exists', async () => {
    prisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    await service.ensurePartitionForYear(2026);

    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('uses the provided transaction client for insert-date ensures', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ exists: true }]),
      $executeRawUnsafe: jest.fn(),
    };

    await service.ensurePartitionForInsertDate(new Date('2025-12-31T00:00:00.000Z'), tx as never);

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('only pre-creates partitions on the last day of the month', async () => {
    prisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 0, 30, 23, 59));
    await service.ensurePartitionsBeforeMonthBoundary();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();

    jest.setSystemTime(new Date(2026, 0, 31, 23, 59));
    await service.ensurePartitionsBeforeMonthBoundary();
    expect(prisma.$queryRaw).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
