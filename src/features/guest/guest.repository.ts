import { Injectable } from '@nestjs/common';

import { GameId } from '@/common/constants';
import { PrismaService } from '@/infra/prisma/prisma.service';

@Injectable()
export class GuestRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByAuthTokenHash(authTokenHash: string) {
    return this.prisma.guestPlayer.findUnique({
      where: { authTokenHash },
    });
  }

  create(gameId: GameId, authTokenHash: string) {
    return this.prisma.guestPlayer.create({
      data: {
        gameId,
        authTokenHash,
      },
    });
  }

  updateName(gameId: GameId, id: string, name: string) {
    return this.prisma.guestPlayer.update({
      data: { name },
      where: { gameId_id: { gameId, id } },
    });
  }
}
