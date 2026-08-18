import { GameId } from '@prisma/client';

import {
  betterRanksWhere,
  LeaderboardRepository,
} from '@/features/leaderboard/leaderboard.repository';
import type { PrismaService } from '@/infra/prisma/prisma.service';

describe('betterRanksWhere', () => {
  it('counts strictly higher scores or the same score with a smaller guestId', () => {
    expect(betterRanksWhere(GameId.FRULOOP, 'g5', 100)).toEqual({
      gameId: GameId.FRULOOP,
      OR: [{ bestScore: { gt: 100 } }, { bestScore: 100, guestId: { lt: 'g5' } }],
    });
  });
});

describe('LeaderboardRepository', () => {
  const leaderboard = {
    count: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  };
  const prisma = {
    leaderboard,
    $queryRaw: jest.fn(),
  };
  const tx = {
    leaderboard: { ...leaderboard },
    $executeRaw: jest.fn(),
  };
  let repository: LeaderboardRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(tx, { leaderboard: { ...leaderboard }, $executeRaw: jest.fn() });
    repository = new LeaderboardRepository(prisma as unknown as PrismaService);
  });

  it('counts and pages rows ordered by score then guestId', async () => {
    leaderboard.count.mockResolvedValue(3);
    leaderboard.findMany.mockResolvedValue([]);

    await repository.count(GameId.FRULOOP);
    await repository.findPage(GameId.FRULOOP, 20, 10);

    expect(leaderboard.count).toHaveBeenCalledWith({ where: { gameId: GameId.FRULOOP } });
    expect(leaderboard.findMany).toHaveBeenCalledWith({
      take: 10,
      skip: 20,
      where: { gameId: GameId.FRULOOP },
      select: { guestId: true, bestScore: true },
      orderBy: [{ bestScore: 'desc' }, { guestId: 'asc' }],
    });
  });

  it('reads a guest best score and better-rank count', async () => {
    leaderboard.findUnique.mockResolvedValue({ bestScore: 10 });
    leaderboard.count.mockResolvedValue(4);

    await expect(repository.getGuestBestScore(GameId.FRULOOP, 'g1')).resolves.toEqual({
      bestScore: 10,
    });
    await expect(repository.countBetterRanks(GameId.FRULOOP, 'g1', 10)).resolves.toBe(4);
    expect(leaderboard.count).toHaveBeenCalledWith({
      where: betterRanksWhere(GameId.FRULOOP, 'g1', 10),
    });
  });

  it('exposes the same lookups on a transaction client', async () => {
    tx.leaderboard.findUnique.mockResolvedValue({ bestScore: 8 });
    tx.leaderboard.count.mockResolvedValue(2);
    tx.leaderboard.findMany.mockResolvedValue([{ guestId: 'g100' }]);

    await repository.getGuestBestScoreTx(tx as never, GameId.MEMORA, 'g1');
    await repository.countBetterRanksTx(tx as never, GameId.MEMORA, 'g1', 8);
    await repository.findGuestAtRankTx(tx as never, GameId.MEMORA, 100);
    await repository.upsertBestScoreTx(tx as never, GameId.MEMORA, 'g1', 12);

    expect(tx.leaderboard.findMany).toHaveBeenCalledWith({
      take: 1,
      skip: 99,
      where: { gameId: GameId.MEMORA },
      select: { guestId: true },
      orderBy: [{ bestScore: 'desc' }, { guestId: 'asc' }],
    });
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('returns an empty list when resolving ranks for no guests', async () => {
    await expect(repository.resolveRanksForGuests(GameId.FRULOOP, [])).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('coerces bigint ranks from the batch query', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { guestId: 'g1', bestScore: 10, rank: 2n },
      { guestId: 'g2', bestScore: 8, rank: 3 },
    ]);

    await expect(repository.resolveRanksForGuests(GameId.FRULOOP, ['g1', 'g2'])).resolves.toEqual([
      { guestId: 'g1', bestScore: 10, rank: 2 },
      { guestId: 'g2', bestScore: 8, rank: 3 },
    ]);
  });
});
