import { SkipApiKey, SKIP_API_KEY_KEY } from '@/common/decorators/skip-api-key.decorator';

describe('SkipApiKey', () => {
  it('marks the handler to bypass the API key guard', () => {
    class Target {
      @SkipApiKey()
      handler() {
        return undefined;
      }
    }

    expect(Reflect.getMetadata(SKIP_API_KEY_KEY, Target.prototype.handler)).toBe(true);
  });
});
