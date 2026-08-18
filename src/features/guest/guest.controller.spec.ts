import { GameId } from '@prisma/client';

import { GuestService } from '@/features/guest/guest.service';
import { GuestController } from '@/features/guest/guest.controller';

describe('GuestController', () => {
  const guestService = {
    initializeGuest: jest.fn(),
    updateName: jest.fn(),
  };
  const controller = new GuestController(guestService as unknown as GuestService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates init to the service', async () => {
    const dto = { gameId: GameId.FRULOOP };
    guestService.initializeGuest.mockResolvedValue({ guestId: 'g1' });

    await expect(controller.initGuest(dto)).resolves.toEqual({ guestId: 'g1' });
    expect(guestService.initializeGuest).toHaveBeenCalledWith(dto);
  });

  it('delegates name updates with the authenticated guest', async () => {
    guestService.updateName.mockResolvedValue({ name: 'Ada' });

    await expect(
      controller.updateName({ name: 'Ada' }, { guestId: 'g1', gameId: GameId.FRULOOP }),
    ).resolves.toEqual({ name: 'Ada' });
    expect(guestService.updateName).toHaveBeenCalledWith('g1', GameId.FRULOOP, 'Ada');
  });
});
