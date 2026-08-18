import { GameId } from '@prisma/client';

import { ResultsService } from '@/features/results/results.service';
import { ResultsController } from '@/features/results/results.controller';

describe('ResultsController', () => {
  const resultsService = { submitResults: jest.fn() };
  const controller = new ResultsController(resultsService as unknown as ResultsService);

  it('delegates batch submit to the service', async () => {
    const dto = { gameId: GameId.FRULOOP, items: [] };
    const guest = { guestId: 'g1', gameId: GameId.FRULOOP };
    resultsService.submitResults.mockResolvedValue({ insertedCount: 1 });

    await expect(controller.submitResults(dto, guest)).resolves.toEqual({ insertedCount: 1 });
    expect(resultsService.submitResults).toHaveBeenCalledWith(guest, dto);
  });
});
