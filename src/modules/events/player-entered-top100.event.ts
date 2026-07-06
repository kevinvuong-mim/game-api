import type { GameId } from '@/common/constants';

export class PlayerEnteredTop100Event {
  constructor(
    readonly gameId: GameId,
    readonly guestId: string,
    readonly rank: number,
    readonly bestScore: number,
  ) {}
}
