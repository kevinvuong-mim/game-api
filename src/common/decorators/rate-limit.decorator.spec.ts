import { RATE_LIMIT_KEY, RateLimit } from '@/common/decorators/rate-limit.decorator';

describe('RateLimit', () => {
  const ipLimit = {
    limit: 3,
    keyPrefix: 'rate:init:',
    windowSeconds: 60,
    keySource: 'ip' as const,
  };
  const hourlyLimit = {
    limit: 15,
    keyPrefix: 'rate:init:h:',
    windowSeconds: 3600,
    keySource: 'ip' as const,
  };

  it('throws when no options are provided', () => {
    expect(() => RateLimit()).toThrow('RateLimit requires at least one options object');
  });

  it('stores a single window as an object', () => {
    class Target {
      @RateLimit(ipLimit)
      handler() {
        return undefined;
      }
    }

    expect(Reflect.getMetadata(RATE_LIMIT_KEY, Target.prototype.handler)).toEqual(ipLimit);
  });

  it('stores multiple windows as an array', () => {
    class Target {
      @RateLimit(ipLimit, hourlyLimit)
      handler() {
        return undefined;
      }
    }

    expect(Reflect.getMetadata(RATE_LIMIT_KEY, Target.prototype.handler)).toEqual([
      ipLimit,
      hourlyLimit,
    ]);
  });
});
