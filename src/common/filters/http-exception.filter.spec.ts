import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';

import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

function createHost(url = '/api/guest/init', method = 'POST') {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = { url, method };

  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;

  return { host, response, request };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('maps a string HttpException body', () => {
    const { host, response } = createHost();
    filter.catch(new HttpException('Bearer token required', HttpStatus.UNAUTHORIZED), host);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 401,
        message: 'Bearer token required',
        path: '/api/guest/init',
      }),
    );
  });

  it('maps an object HttpException body', () => {
    const { host, response } = createHost();
    filter.catch(
      new HttpException({ statusCode: 403, error: 'Forbidden', message: 'nope' }, 403),
      host,
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Forbidden',
        message: 'nope',
        statusCode: 403,
      }),
    );
  });

  it('treats array messages as validation errors', () => {
    const { host, response } = createHost();
    const details = [{ field: 'gameId', message: 'must be a valid enum' }];
    filter.catch(new HttpException({ message: details, error: 'Bad Request' }, 400), host);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Validation failed',
        errors: details,
        error: 'Bad Request',
      }),
    );
  });

  it('exposes unexpected errors in non-production', () => {
    process.env.NODE_ENV = 'development';
    const { host, response } = createHost();
    const error = new Error('boom');
    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'boom',
        error: 'Error',
        stack: error.stack,
      }),
    );
  });

  it('hides unexpected error details in production', () => {
    process.env.NODE_ENV = 'production';
    const { host, response } = createHost();
    filter.catch(new Error('secret'), host);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Internal server error',
        error: 'Internal Server Error',
      }),
    );
    expect(response.json.mock.calls[0][0].stack).toBeUndefined();
  });

  it('handles non-error throwables', () => {
    process.env.NODE_ENV = 'production';
    const { host, response } = createHost('/api/health', 'GET');
    filter.catch('nope', host);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 500,
        path: '/api/health',
      }),
    );
  });
});
