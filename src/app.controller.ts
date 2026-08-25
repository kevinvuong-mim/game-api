import type { Response } from 'express';
import { Get, Res, Controller, HttpStatus } from '@nestjs/common';

import { AppService } from '@/app.service';
import { SkipApiKey } from '@/common/decorators';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @SkipApiKey()
  async getHealth(@Res({ passthrough: true }) res: Response) {
    const health = await this.appService.checkHealth();
    const { healthy, ...payload } = health;

    if (!healthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return payload;
  }
}
