import { Injectable } from '@nestjs/common';

import type { GameId } from '@/common/constants';
import { InitGuestDto } from '@/features/guest/dto/init-guest.dto';
import { GuestRepository } from '@/features/guest/guest.repository';
import { hashSecretToken, generateSecretToken } from '@/common/utils';

@Injectable()
export class GuestService {
  constructor(private readonly guestRepository: GuestRepository) {}

  async initializeGuest(dto: InitGuestDto) {
    const secretToken = generateSecretToken();
    const authTokenHash = hashSecretToken(secretToken);

    const guest = await this.guestRepository.create(dto.gameId, authTokenHash);

    return {
      secretToken,
      guestId: guest.id,
      gameId: guest.gameId,
    };
  }

  async updateName(guestId: string, gameId: GameId, name: string) {
    const updated = await this.guestRepository.updateName(gameId, guestId, name);
    return {
      name: updated.name,
      guestId: updated.id,
      gameId: updated.gameId,
    };
  }
}
