import { Get, Controller, ServiceUnavailableException } from '@nestjs/common';

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
        uptime: health.uptime,
        services: health.services,
        timestamp: health.timestamp,
      });
    }

    const { healthy: _healthy, ...payload } = health;
    return payload;
  }
}
