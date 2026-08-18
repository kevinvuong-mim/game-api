import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

import { AppService } from '@/app.service';
import { AppController } from '@/app.controller';

describe('AppController', () => {
  const appService = { checkHealth: jest.fn() };
  const controller = new AppController(appService as unknown as AppService);
  const res = { status: jest.fn() } as unknown as Response;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the health payload when all services are up', async () => {
    appService.checkHealth.mockResolvedValue({
      healthy: true,
      status: 'ok',
      services: { db: 'connected', redis: 'connected' },
    });

    await expect(controller.getHealth(res)).resolves.toEqual({
      status: 'ok',
      services: { db: 'connected', redis: 'connected' },
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('sets 503 when health is degraded', async () => {
    appService.checkHealth.mockResolvedValue({
      healthy: false,
      status: 'degraded',
      services: { db: 'disconnected', redis: 'connected' },
    });

    await expect(controller.getHealth(res)).resolves.toEqual({
      status: 'degraded',
      services: { db: 'disconnected', redis: 'connected' },
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
