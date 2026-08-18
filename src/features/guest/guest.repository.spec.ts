import { DevicePlatform, GameId, NotificationLocale, Prisma } from '@prisma/client';

import { FcmTokenConflictError, GuestRepository } from '@/features/guest/guest.repository';
import type { PrismaService } from '@/infra/prisma/prisma.service';

describe('GuestRepository', () => {
  const guestPlayer = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
  };
  const tx = { guestPlayer: { ...guestPlayer } };
  const prisma = {
    guestPlayer,
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  let repository: GuestRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(tx, { guestPlayer: { ...guestPlayer } });
    prisma.$transaction.mockImplementation((fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    repository = new GuestRepository(prisma as unknown as PrismaService);
  });

  it('looks up a guest by auth token hash', async () => {
    guestPlayer.findUnique.mockResolvedValue({ id: 'g1' });
    await expect(repository.findByAuthTokenHash('hash')).resolves.toEqual({ id: 'g1' });
    expect(guestPlayer.findUnique).toHaveBeenCalledWith({ where: { authTokenHash: 'hash' } });
  });

  it('creates a guest', async () => {
    guestPlayer.create.mockResolvedValue({ id: 'g1' });
    await repository.create(GameId.FRULOOP, 'hash');
    expect(guestPlayer.create).toHaveBeenCalledWith({
      data: { gameId: GameId.FRULOOP, authTokenHash: 'hash' },
    });
  });

  it('updates a display name by composite id', async () => {
    guestPlayer.update.mockResolvedValue({ id: 'g1', name: 'Ada' });
    await repository.updateName(GameId.FRULOOP, 'g1', 'Ada');
    expect(guestPlayer.update).toHaveBeenCalledWith({
      data: { name: 'Ada' },
      where: { gameId_id: { gameId: GameId.FRULOOP, id: 'g1' } },
    });
  });

  it('returns an empty name map for no ids', async () => {
    await expect(repository.findNamesByIds([])).resolves.toEqual(new Map());
    expect(guestPlayer.findMany).not.toHaveBeenCalled();
  });

  it('maps guest names by id', async () => {
    guestPlayer.findMany.mockResolvedValue([
      { id: 'g1', name: 'Ada' },
      { id: 'g2', name: null },
    ]);

    await expect(repository.findNamesByIds(['g1', 'g2'])).resolves.toEqual(
      new Map([
        ['g1', 'Ada'],
        ['g2', null],
      ]),
    );
  });

  it('transfers an FCM token away from other guests then assigns it', async () => {
    tx.guestPlayer.update.mockResolvedValue({ id: 'g1' });

    await expect(
      repository.registerFcmToken({
        token: 'tok',
        gameId: GameId.FRULOOP,
        guestId: 'g1',
        platform: DevicePlatform.IOS,
        locale: NotificationLocale.EN,
      }),
    ).resolves.toEqual({ id: 'g1' });

    expect(tx.guestPlayer.updateMany).toHaveBeenCalledWith({
      where: {
        fcmToken: 'tok',
        NOT: { AND: [{ id: 'g1' }, { gameId: GameId.FRULOOP }] },
      },
      data: { fcmToken: null, devicePlatform: null, notificationLocale: null },
    });
    expect(tx.guestPlayer.update).toHaveBeenCalledWith({
      where: { gameId_id: { gameId: GameId.FRULOOP, id: 'g1' } },
      data: {
        fcmToken: 'tok',
        notificationLocale: NotificationLocale.EN,
        devicePlatform: DevicePlatform.IOS,
      },
    });
  });

  it('maps unique constraint failures to FcmTokenConflictError', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '6.0.0',
      }),
    );

    await expect(
      repository.registerFcmToken({
        token: 'tok',
        gameId: GameId.FRULOOP,
        guestId: 'g1',
        platform: DevicePlatform.ANDROID,
        locale: NotificationLocale.VI,
      }),
    ).rejects.toBeInstanceOf(FcmTokenConflictError);
  });

  it('rethrows non-unique errors from registerFcmToken', async () => {
    prisma.$transaction.mockRejectedValue(new Error('db'));

    await expect(
      repository.registerFcmToken({
        token: 'tok',
        gameId: GameId.FRULOOP,
        guestId: 'g1',
        platform: DevicePlatform.IOS,
        locale: NotificationLocale.EN,
      }),
    ).rejects.toThrow('db');
  });

  it('returns null when updating a guest that has no FCM token', async () => {
    guestPlayer.findUnique.mockResolvedValue({ id: 'g1', fcmToken: null, devicePlatform: null });

    await expect(
      repository.updateFcmToken(GameId.FRULOOP, 'g1', 'new', NotificationLocale.EN),
    ).resolves.toBeNull();
  });

  it('updates an existing FCM token and keeps the stored platform', async () => {
    guestPlayer.findUnique.mockResolvedValue({
      id: 'g1',
      fcmToken: 'old',
      devicePlatform: DevicePlatform.ANDROID,
    });
    tx.guestPlayer.update.mockResolvedValue({ id: 'g1' });

    await expect(
      repository.updateFcmToken(GameId.FRULOOP, 'g1', 'new', NotificationLocale.VI),
    ).resolves.toEqual({ id: 'g1' });
    expect(tx.guestPlayer.update).toHaveBeenCalledWith({
      where: { gameId_id: { gameId: GameId.FRULOOP, id: 'g1' } },
      data: {
        fcmToken: 'new',
        notificationLocale: NotificationLocale.VI,
        devicePlatform: DevicePlatform.ANDROID,
      },
    });
  });

  it('unregisters, finds, invalidates, and batches active tokens', async () => {
    guestPlayer.updateMany.mockResolvedValue({ count: 1 });
    guestPlayer.findFirst.mockResolvedValue({ id: 'g1', fcmToken: 'tok' });
    guestPlayer.findMany.mockResolvedValue([{ id: 'g1' }]);

    await repository.unregisterFcmToken(GameId.FRULOOP, 'g1');
    await repository.findActiveFcmToken(GameId.FRULOOP, 'g1');
    await repository.markFcmTokenInvalid('tok');
    await repository.findActiveFcmTokenBatch(GameId.FRULOOP, 'cursor-1', 10);

    expect(guestPlayer.updateMany).toHaveBeenCalledTimes(2);
    expect(guestPlayer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        skip: 1,
        cursor: { id: 'cursor-1' },
        where: { gameId: GameId.FRULOOP, fcmToken: { not: null } },
      }),
    );
  });

  it('omits cursor paging on the first FCM batch page', async () => {
    guestPlayer.findMany.mockResolvedValue([]);
    await repository.findActiveFcmTokenBatch(GameId.FRULOOP);
    expect(guestPlayer.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ cursor: expect.anything() }),
    );
  });
});
