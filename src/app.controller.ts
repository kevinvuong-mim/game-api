import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { AppService } from '@/app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  async getHealth() {
    const health = await this.appService.checkHealth();

    if (!health.healthy) {
      throw new ServiceUnavailableException({
        status: health.status,
        timestamp: health.timestamp,
        services: health.services,
        uptime: health.uptime,
      });
    }

    const { healthy: _healthy, ...payload } = health;
    return payload;
  }
}
