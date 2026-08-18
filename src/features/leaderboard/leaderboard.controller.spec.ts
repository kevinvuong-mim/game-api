import { GameId } from '@prisma/client';

import { LeaderboardService } from '@/features/leaderboard/leaderboard.service';
import { LeaderboardController } from '@/features/leaderboard/leaderboard.controller';

describe('LeaderboardController', () => {
  const leaderboardService = { getLeaderboard: jest.fn() };
  const controller = new LeaderboardController(leaderboardService as unknown as LeaderboardService);

  it('delegates query parsing to the service', async () => {
    const query = { gameId: GameId.FRULOOP, page: 1, limit: 20 };
    leaderboardService.getLeaderboard.mockResolvedValue({ items: [] });

    await expect(controller.getLeaderboard(query)).resolves.toEqual({ items: [] });
    expect(leaderboardService.getLeaderboard).toHaveBeenCalledWith(query);
  });
});
