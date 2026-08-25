import {
  Injectable,
  HttpStatus,
  CanActivate,
  HttpException,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { API_KEY_HEADER } from '@/common/constants';
import { SKIP_API_KEY_KEY } from '@/common/decorators';
import { matchesConfiguredSecret } from '@/common/utils';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_API_KEY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip) {
      return true;
    }

    const configured = this.configService.get<string>('API_KEY')?.trim() ?? '';
    if (!configured) {
      throw new HttpException('API key is not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.headers[API_KEY_HEADER];
    const provided = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';

    if (!provided || !matchesConfiguredSecret(provided, configured)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
