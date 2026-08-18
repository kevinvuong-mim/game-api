import { GameId } from '@prisma/client';

import { hashSecretToken } from '@/common/utils';
import { GuestService } from '@/features/guest/guest.service';
import type { GuestRepository } from '@/features/guest/guest.repository';

describe('GuestService', () => {
  const guestRepository = {
    create: jest.fn(),
    updateName: jest.fn(),
  };
  let service: GuestService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GuestService(guestRepository as unknown as GuestRepository);
  });

  it('creates a guest and returns the plaintext token once', async () => {
    guestRepository.create.mockResolvedValue({
      id: 'g1',
      gameId: GameId.FRULOOP,
    });

    const result = await service.initializeGuest({ gameId: GameId.FRULOOP });

    expect(result).toEqual({
      secretToken: expect.any(String),
      guestId: 'g1',
      gameId: GameId.FRULOOP,
    });
    expect(result.secretToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(guestRepository.create).toHaveBeenCalledWith(
      GameId.FRULOOP,
      hashSecretToken(result.secretToken),
    );
  });

  it('updates the display name', async () => {
    guestRepository.updateName.mockResolvedValue({
      id: 'g1',
      name: 'Player',
      gameId: GameId.MEMORA,
    });

    await expect(service.updateName('g1', GameId.MEMORA, 'Player')).resolves.toEqual({
      name: 'Player',
      guestId: 'g1',
      gameId: GameId.MEMORA,
    });
    expect(guestRepository.updateName).toHaveBeenCalledWith(GameId.MEMORA, 'g1', 'Player');
  });
});
