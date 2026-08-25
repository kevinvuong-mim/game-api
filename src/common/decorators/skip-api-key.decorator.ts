import { SetMetadata } from '@nestjs/common';

export const SKIP_API_KEY_KEY = 'skipApiKey';

/** Opt out of the global `X-Api-Key` guard (health probes only). */
export const SkipApiKey = () => SetMetadata(SKIP_API_KEY_KEY, true);
