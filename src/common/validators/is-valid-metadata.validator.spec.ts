import { validate } from 'class-validator';

import { IsValidMetadata } from '@/common/validators/is-valid-metadata.validator';

class MetadataHost {
  @IsValidMetadata()
  metadata?: Record<string, unknown>;
}

async function validateMetadata(metadata: unknown) {
  const host = new MetadataHost();
  host.metadata = metadata as Record<string, unknown>;
  return validate(host);
}

describe('IsValidMetadata', () => {
  it('accepts undefined, null, and an empty object', async () => {
    expect(await validate(new MetadataHost())).toHaveLength(0);

    const withNull = new MetadataHost();
    withNull.metadata = null as unknown as Record<string, unknown>;
    expect(await validate(withNull)).toHaveLength(0);

    expect(await validateMetadata({})).toHaveLength(0);
  });

  it('accepts a flat object of string, finite number, and null values', async () => {
    expect(
      await validateMetadata({
        combo: 3,
        source: 'offline',
        note: null,
      }),
    ).toHaveLength(0);
  });

  it('rejects booleans because Number.isFinite does not coerce them', async () => {
    expect(await validateMetadata({ won: true })).not.toHaveLength(0);
  });

  it('rejects arrays, nested objects, and non-finite numbers', async () => {
    expect(await validateMetadata(['x'])).not.toHaveLength(0);
    expect(await validateMetadata({ nested: { a: 1 } })).not.toHaveLength(0);
    expect(await validateMetadata({ inf: Number.POSITIVE_INFINITY })).not.toHaveLength(0);
    expect(await validateMetadata({ nan: Number.NaN })).not.toHaveLength(0);
  });

  it('rejects more than 10 keys', async () => {
    const metadata = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, i]));
    expect(await validateMetadata(metadata)).not.toHaveLength(0);
  });

  it('rejects empty or overly long keys and long string values', async () => {
    expect(await validateMetadata({ '': 1 })).not.toHaveLength(0);
    expect(await validateMetadata({ ['k'.repeat(65)]: 1 })).not.toHaveLength(0);
    expect(await validateMetadata({ note: 'x'.repeat(257) })).not.toHaveLength(0);
  });

  it('rejects payloads larger than 2048 bytes', async () => {
    const metadata = {
      a: 'x'.repeat(256),
      b: 'x'.repeat(256),
      c: 'x'.repeat(256),
      d: 'x'.repeat(256),
      e: 'x'.repeat(256),
      f: 'x'.repeat(256),
      g: 'x'.repeat(256),
      h: 'x'.repeat(256),
    };
    expect(await validateMetadata(metadata)).not.toHaveLength(0);
  });
});
