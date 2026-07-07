import { GameId } from '@prisma/client';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/infra/prisma/prisma.service';

@Injectable()
export class GuestRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySecretTokenHash(secretTokenHash: string) {
    return this.prisma.guestPlayer.findUnique({
      where: { secretTokenHash },
    });
  }

  create(gameId: GameId, secretTokenHash: string) {
    return this.prisma.guestPlayer.create({
      data: {
        gameId,
        secretTokenHash,
      },
    });
  }

  updateName(gameId: GameId, id: string, name: string) {
    return this.prisma.guestPlayer.update({
      where: { gameId_id: { gameId, id } },
      data: { name },
    });
  }
}
