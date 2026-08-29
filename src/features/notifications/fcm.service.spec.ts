import { ConfigService } from '@nestjs/config';

import { FcmService } from '@/features/notifications/fcm.service';
import { FCM_ANDROID_CHANNEL_ID, NOTIFICATION_TYPES } from '@/common/constants';

const firebaseState = {
  apps: [] as unknown[],
  send: jest.fn(),
  initializeApp: jest.fn(),
  cert: jest.fn((value: unknown) => value),
};

jest.mock('firebase-admin', () => ({
  get apps() {
    return firebaseState.apps;
  },
  initializeApp: (config: unknown) => {
    firebaseState.initializeApp(config);
    firebaseState.apps.push({ name: '[DEFAULT]' });
  },
  credential: {
    cert: (value: unknown) => firebaseState.cert(value),
  },
  messaging: () => ({
    send: (...args: unknown[]) => firebaseState.send(...args),
  }),
}));

function createService(env: Record<string, string | undefined> = {}) {
  const configService = {
    get: jest.fn((key: string) => env[key]),
  };
  return new FcmService(configService as unknown as ConfigService);
}

describe('FcmService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseState.apps.length = 0;
    firebaseState.send.mockReset();
    firebaseState.cert.mockImplementation((value: unknown) => value);
  });

  it('stays disabled when Firebase env is incomplete', () => {
    const service = createService({ FIREBASE_PROJECT_ID: 'p' });
    service.onModuleInit();
    expect(service.isEnabled()).toBe(false);
    expect(firebaseState.initializeApp).not.toHaveBeenCalled();
  });

  it('initializes Firebase and unescapes the private key', () => {
    const service = createService({
      FIREBASE_PROJECT_ID: 'proj',
      FIREBASE_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: '-----BEGIN\\nKEY-----',
    });
    service.onModuleInit();

    expect(service.isEnabled()).toBe(true);
    expect(firebaseState.cert).toHaveBeenCalledWith({
      projectId: 'proj',
      clientEmail: 'svc@proj.iam.gserviceaccount.com',
      privateKey: '-----BEGIN\nKEY-----',
    });
  });

  it('does not initialize a second app when one already exists', () => {
    firebaseState.apps.push({ name: 'existing' });
    const service = createService({
      FIREBASE_PROJECT_ID: 'proj',
      FIREBASE_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: 'key',
    });
    service.onModuleInit();

    expect(firebaseState.initializeApp).not.toHaveBeenCalled();
    expect(service.isEnabled()).toBe(true);
  });

  it('stays disabled when credential initialization throws', () => {
    firebaseState.cert.mockImplementation(() => {
      throw new Error('bad key');
    });
    const service = createService({
      FIREBASE_PROJECT_ID: 'proj',
      FIREBASE_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: 'key',
    });
    service.onModuleInit();

    expect(service.isEnabled()).toBe(false);
  });

  it('skips send when Firebase is disabled', async () => {
    const service = createService();
    service.onModuleInit();

    await expect(
      service.sendToToken('tok', {
        type: NOTIFICATION_TYPES.RANK_PUSH,
        route: 'Leaderboard',
        params: { rank: 1 },
      }),
    ).resolves.toEqual({ success: false });
  });

  it('sends a localized payload with android and apns options', async () => {
    const service = createService({
      FIREBASE_PROJECT_ID: 'proj',
      FIREBASE_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: 'key',
    });
    service.onModuleInit();
    firebaseState.send.mockResolvedValue('id');

    await expect(
      service.sendToToken('tok', {
        type: NOTIFICATION_TYPES.RANK_PUSH,
        locale: 'vi',
        route: 'Leaderboard',
        params: { rank: 8 },
      }),
    ).resolves.toEqual({ success: true });

    expect(firebaseState.send).toHaveBeenCalledWith({
      token: 'tok',
      notification: {
        title: 'Cập nhật thứ hạng',
        body: 'Hiện bạn đang đứng hạng #8.',
      },
      data: {
        type: NOTIFICATION_TYPES.RANK_PUSH,
        route: 'Leaderboard',
        rank: '8',
      },
      android: {
        priority: 'high',
        notification: { channelId: FCM_ANDROID_CHANNEL_ID },
      },
      apns: {
        payload: { aps: { sound: 'default' } },
      },
    });
  });

  it('flags invalid registration tokens', async () => {
    const service = createService({
      FIREBASE_PROJECT_ID: 'proj',
      FIREBASE_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: 'key',
    });
    service.onModuleInit();
    const error = Object.assign(new Error('invalid'), {
      code: 'messaging/invalid-registration-token',
    });
    firebaseState.send.mockRejectedValue(error);

    await expect(
      service.sendToToken('tok', { type: NOTIFICATION_TYPES.TOP_100_EXITED, route: 'Leaderboard' }),
    ).resolves.toEqual({ success: false, invalidToken: true });
  });

  it('returns a generic failure for other send errors', async () => {
    const service = createService({
      FIREBASE_PROJECT_ID: 'proj',
      FIREBASE_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: 'key',
    });
    service.onModuleInit();
    firebaseState.send.mockRejectedValue(new Error('network'));

    await expect(
      service.sendToToken('tok', { type: NOTIFICATION_TYPES.RANK_PUSH, route: 'Leaderboard' }),
    ).resolves.toEqual({ success: false });
  });

  it('does not treat non-Error throwables as invalid tokens', async () => {
    const service = createService({
      FIREBASE_PROJECT_ID: 'proj',
      FIREBASE_CLIENT_EMAIL: 'svc@proj.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: 'key',
    });
    service.onModuleInit();
    firebaseState.send.mockRejectedValue('nope');

    await expect(
      service.sendToToken('tok', { type: NOTIFICATION_TYPES.RANK_PUSH, route: 'Leaderboard' }),
    ).resolves.toEqual({ success: false });
  });
});
