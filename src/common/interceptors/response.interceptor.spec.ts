import { of, lastValueFrom } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';

import { ResponseInterceptor } from '@/common/interceptors/response.interceptor';

function createContext(method: string, url = '/api/guest/init', statusCode = 201) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url }),
      getResponse: () => ({ statusCode }),
    }),
  } as ExecutionContext;
}

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();

  it.each([
    ['GET', 'Data retrieved successfully'],
    ['POST', 'Resource created successfully'],
    ['PATCH', 'Resource updated successfully'],
    ['PUT', 'Resource updated successfully'],
    ['DELETE', 'Resource deleted successfully'],
    ['OPTIONS', 'Operation completed successfully'],
  ])('wraps %s responses with the default message', async (method, message) => {
    const result = await lastValueFrom(
      interceptor.intercept(createContext(method), {
        handle: () => of({ guestId: 'g1' }),
      } as CallHandler),
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: { guestId: 'g1' },
        statusCode: 201,
        path: '/api/guest/init',
        message,
      }),
    );
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('normalizes undefined handler data to null', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(createContext('GET', '/api/health', 200), {
        handle: () => of(undefined),
      } as CallHandler),
    );

    expect(result.data).toBeNull();
  });
});
