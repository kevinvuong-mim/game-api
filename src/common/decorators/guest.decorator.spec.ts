import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import { GameId } from '@prisma/client';

import { Guest, type AuthenticatedGuest } from '@/common/decorators/guest.decorator';

describe('Guest', () => {
  it('returns the authenticated guest from the request', () => {
    class Target {
      handler(@Guest() _guest: AuthenticatedGuest) {
        return undefined;
      }
    }

    const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Target, 'handler') as Record<
      string,
      { factory: (data: unknown, ctx: ExecutionContext) => AuthenticatedGuest }
    >;
    const factory = Object.values(metadata)[0].factory;
    const guest: AuthenticatedGuest = { guestId: 'guest-1', gameId: GameId.FRULOOP };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: guest }),
      }),
    } as ExecutionContext;

    expect(factory(undefined, ctx)).toEqual(guest);
  });
});
