import { AppService } from '@/app.service';
import type { RedisService } from '@/infra/redis/redis.service';
import type { PrismaService } from '@/infra/prisma/prisma.service';

describe('AppService', () => {
  const prisma = { $queryRaw: jest.fn() };
  const redisService = { ping: jest.fn() };
  let service: AppService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppService(
      prisma as unknown as PrismaService,
      redisService as unknown as RedisService,
    );
  });

  it('reports ok when Postgres and Redis are connected', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redisService.ping.mockResolvedValue(true);

    const result = await service.checkHealth();

    expect(result).toEqual(
      expect.objectContaining({
        healthy: true,
        status: 'ok',
        services: { db: 'connected', redis: 'connected' },
      }),
    );
    expect(result.uptime).toEqual(expect.any(Number));
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('reports degraded when Postgres is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('db down'));
    redisService.ping.mockResolvedValue(true);

    await expect(service.checkHealth()).resolves.toEqual(
      expect.objectContaining({
        healthy: false,
        status: 'degraded',
        services: { db: 'disconnected', redis: 'connected' },
      }),
    );
  });

  it('reports degraded when Redis is down', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redisService.ping.mockResolvedValue(false);

    await expect(service.checkHealth()).resolves.toEqual(
      expect.objectContaining({
        healthy: false,
        status: 'degraded',
        services: { db: 'connected', redis: 'disconnected' },
      }),
    );
  });
});
