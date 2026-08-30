import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { HttpException, ForbiddenException, type ExecutionContext } from '@nestjs/common';

import { API_KEY_HEADER } from '@/common/constants';
import { SKIP_API_KEY_KEY } from '@/common/decorators';
import { ApiKeyGuard } from '@/common/guards/api-key.guard';

function createContext(apiKey?: string | string[]): ExecutionContext {
  const headers: Record<string, string | string[] | undefined> = {};
  if (apiKey !== undefined) {
    headers[API_KEY_HEADER] = apiKey;
  }

  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const configService = { get: jest.fn() };
  let guard: ApiKeyGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
    configService.get.mockReturnValue('app-secret');
    guard = new ApiKeyGuard(
      reflector as unknown as Reflector,
      configService as unknown as ConfigService,
    );
  });

  it('skips verification when SkipApiKey is set', () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    expect(guard.canActivate(createContext())).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(SKIP_API_KEY_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
    expect(configService.get).not.toHaveBeenCalled();
  });

  it('fails closed when API_KEY is not configured', () => {
    configService.get.mockReturnValue('  ');

    expect(() => guard.canActivate(createContext('app-secret'))).toThrow(HttpException);
    expect(() => guard.canActivate(createContext('app-secret'))).toThrow(
      'API key is not configured',
    );
  });

  it('rejects missing or blank keys', () => {
    expect(() => guard.canActivate(createContext())).toThrow(ForbiddenException);
    expect(() => guard.canActivate(createContext('   '))).toThrow('Invalid API key');
  });

  it('accepts a matching key', () => {
    expect(guard.canActivate(createContext('app-secret'))).toBe(true);
  });

  it('accepts a rotated key from a comma-separated list', () => {
    configService.get.mockReturnValue('old-secret, app-secret');

    expect(guard.canActivate(createContext('app-secret'))).toBe(true);
  });

  it('reads the first header value when Express supplies an array', () => {
    expect(guard.canActivate(createContext(['app-secret', 'other']))).toBe(true);
  });

  it('rejects an unknown key', () => {
    expect(() => guard.canActivate(createContext('nope'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(createContext('nope'))).toThrow('Invalid API key');
  });
});
