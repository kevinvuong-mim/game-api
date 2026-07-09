import {
  Logger,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

import { hashSecretToken } from '@/common/utils';
import { validateGameId } from '@/common/constants';
import { RedisService } from '@/infra/redis/redis.service';
import { GuestRepository } from '@/features/guest/guest.repository';
import type { AuthenticatedGuest } from '@/common/decorators/guest.decorator';

type GuestRequest = Request & { user?: AuthenticatedGuest };

@Injectable()
export class GuestAuthGuard implements CanActivate {
  private readonly logger = new Logger(GuestAuthGuard.name);

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
    const cached = await this.getCachedGuest(tokenHash);

    if (cached) {
      request.user = cached;
      return true;
    }

    const guest = await this.guestRepository.findByAuthTokenHash(tokenHash);
    if (!guest) {
      throw new UnauthorizedException('Invalid token');
    }

    const user: AuthenticatedGuest = {
      guestId: guest.id,
      gameId: validateGameId(guest.gameId),
    };

    await this.cacheGuest(tokenHash, user);
    request.user = user;
    return true;
  }

  private async getCachedGuest(tokenHash: string): Promise<AuthenticatedGuest | null> {
    try {
      return await this.redisService.getAuthTokenGuestId(tokenHash);
    } catch {
      this.logger.warn('Auth cache read skipped — Redis unavailable');
      return null;
    }
  }

  private async cacheGuest(tokenHash: string, user: AuthenticatedGuest): Promise<void> {
    try {
      await this.redisService.setAuthTokenGuestId(tokenHash, user);
    } catch {
      this.logger.warn('Auth cache write skipped — Redis unavailable');
    }
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
