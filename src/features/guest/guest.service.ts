import { Injectable } from '@nestjs/common';

import { validateGameId } from '@/common/constants';
import { InitGuestDto } from '@/features/guest/dto/init-guest.dto';
import { GuestRepository } from '@/features/guest/guest.repository';
import { hashSecretToken, generateSecretToken } from '@/common/utils';

@Injectable()
export class GuestService {
  constructor(private readonly guestRepository: GuestRepository) {}

  async initializeGuest(dto: InitGuestDto) {
    const gameId = validateGameId(dto.gameId);
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
    const validatedGameId = validateGameId(gameId);
    const updated = await this.guestRepository.updateName(validatedGameId, guestId, name);
    return {
      name: updated.name,
      guestId: updated.id,
      gameId: updated.gameId,
    };
  }
}
