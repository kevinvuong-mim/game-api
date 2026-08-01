import { Injectable } from '@nestjs/common';

import { requireGameId, hashSecretToken, generateSecretToken } from '@/common/utils';
import { InitGuestDto } from '@/features/guest/dto/init-guest.dto';
import { GuestRepository } from '@/features/guest/guest.repository';

@Injectable()
export class GuestService {
  constructor(private readonly guestRepository: GuestRepository) {}

  async initializeGuest(dto: InitGuestDto) {
    const gameId = requireGameId(dto.gameId);
    const secretToken = generateSecretToken();
    const authTokenHash = hashSecretToken(secretToken);

    const guest = await this.guestRepository.create(gameId, authTokenHash);

    return {
      secretToken,
      guestId: guest.id,
      gameId: guest.gameId,
    };
  }

  async updateName(guestId: string, gameId: string, name: string) {
    const validatedGameId = requireGameId(gameId);
    const updated = await this.guestRepository.updateName(validatedGameId, guestId, name);
    return {
      name: updated.name,
      guestId: updated.id,
      gameId: updated.gameId,
    };
  }
}
