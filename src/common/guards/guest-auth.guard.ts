import { Request } from 'express';
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

import { hashSecretToken } from '@/common/utils';
import { validateGameId } from '@/common/constants';
import { RedisService } from '@/modules/redis/redis.service';
import { GuestRepository } from '@/modules/guest/guest.repository';
import type { AuthenticatedGuest } from '@/common/decorators/guest.decorator';

type GuestRequest = Request & { user?: AuthenticatedGuest };

@Injectable()
export class GuestAuthGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly guestRepository: GuestRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuestRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Bearer token required');
    }

    const tokenHash = hashSecretToken(token);
    const cached = await this.redisService.getAuthTokenGuestId(tokenHash);

    if (cached) {
      request.user = cached;
      return true;
    }

    const guest = await this.guestRepository.findBySecretTokenHash(tokenHash);
    if (!guest) {
      throw new UnauthorizedException('Invalid token');
    }

    const user: AuthenticatedGuest = {
      guestId: guest.id,
      gameId: validateGameId(guest.gameId),
    };

    await this.redisService.setAuthTokenGuestId(tokenHash, user);
    request.user = user;
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return undefined;
    }

    const token = header.slice('Bearer '.length).trim();
    return token.length > 0 ? token : undefined;
  }
}
