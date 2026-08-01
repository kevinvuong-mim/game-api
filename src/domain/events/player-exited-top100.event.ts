import { type GameId } from '@/common/constants';

export class PlayerExitedTop100Event {
  static readonly EVENT = 'player.exited.top100';

  constructor(
    public readonly gameId: GameId,
    public readonly guestId: string,
    public readonly rank: number,
    public readonly bestScore: number,
  ) {}
}
