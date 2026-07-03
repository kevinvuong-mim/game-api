import { GameId } from '@prisma/client';
import { Injectable } from '@nestjs/common';

import { validateGameId } from '@/common/constants';
import { InitGuestDto } from '@/modules/guest/dto/init-guest.dto';
import { GuestRepository } from '@/modules/guest/guest.repository';
import { generateSecretToken, hashSecretToken } from '@/common/utils';

@Injectable()
export class GuestService {
  constructor(private readonly guestRepository: GuestRepository) {}

  async initializeGuest(dto: InitGuestDto) {
    const gameId = validateGameId(dto.gameId);
    const secretToken = generateSecretToken();
    const secretTokenHash = hashSecretToken(secretToken);

    const guest = await this.guestRepository.create(gameId, secretTokenHash);

    return {
      secretToken,
      guestId: guest.id,
      gameId: guest.gameId,
    };
  }

  async updateName(guestId: string, gameId: string, name: string) {
    const validatedGameId = validateGameId(gameId) as GameId;
    const updated = await this.guestRepository.updateName(validatedGameId, guestId, name);
    return {
      name: updated.name,
      guestId: updated.id,
      gameId: updated.gameId,
    };
  }
}
