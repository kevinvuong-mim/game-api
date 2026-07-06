import type { GameId } from '@/common/constants';

export class PlayerExitedTop100Event {
  constructor(
    readonly gameId: GameId,
    readonly guestId: string,
    readonly rank: number,
    readonly bestScore: number,
  ) {}
}
