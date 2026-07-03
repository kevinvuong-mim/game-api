import { Injectable } from '@nestjs/common';

import { RedisService } from '@/modules/redis/redis.service';
import { PrismaService } from '@/modules/prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async checkHealth() {
    const [dbStatus, redisStatus] = await Promise.all([this.checkPostgres(), this.checkRedis()]);

    const services = {
      db: dbStatus,
      redis: redisStatus,
    };

    const healthy = dbStatus === 'connected' && redisStatus === 'connected';

    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services,
      uptime: Math.floor(process.uptime()),
      healthy,
    };
  }

  private async checkPostgres(): Promise<'connected' | 'disconnected'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'connected';
    } catch {
      return 'disconnected';
    }
  }

  private async checkRedis(): Promise<'connected' | 'disconnected'> {
    const ok = await this.redisService.ping();
    return ok ? 'connected' : 'disconnected';
  }
}
