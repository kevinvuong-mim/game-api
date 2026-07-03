import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import { GameId } from '@/common/constants';

export interface AuthenticatedGuest {
  guestId: string;
  gameId: GameId;
}

export const Guest = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedGuest => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedGuest }>();
    return request.user;
  },
);
