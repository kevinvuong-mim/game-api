import { Get, Controller, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

import { AppService } from '@/app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  async getHealth(@Res({ passthrough: true }) res: Response) {
    const health = await this.appService.checkHealth();
    const { healthy, ...payload } = health;

    if (!healthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return payload;
  }
}
