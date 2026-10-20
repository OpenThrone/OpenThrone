import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const auditLogger = require('@/utils/auditLogger');

let resetCurrentEra: any;
let CurrentEraResetError: any;
let auditSpy: ReturnType<typeof vi.spyOn>;

describe('resetCurrentEra', () => {
  const startDate = new Date('2026-01-01T00:00:00Z');
  let tx: any;

  beforeEach(() => {
    auditSpy = vi
      .spyOn(auditLogger, 'logActionStrict')
      .mockResolvedValue(undefined);
    delete require.cache[require.resolve('../CurrentEraReset.service')];
    ({
      resetCurrentEra,
      CurrentEraResetError,
    } = require('../CurrentEraReset.service'));
    tx = {
      $queryRaw: vi.fn(),
      era: {
        findFirst: vi.fn().mockResolvedValue({
          id: 7,
          name: 'Test era',
          startDate,
          endDate: null,
          startSettings: null,
        }),
        update: vi.fn(),
      },
      serverSetting: {
        findUnique: vi.fn().mockResolvedValue({ value: true }),
        upsert: vi.fn(),
      },
      featureFlag: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
      users: {
        findMany: vi.fn().mockResolvedValue([{ id: 2 }]),
        update: vi.fn(),
      },
      userUnit: { deleteMany: vi.fn(), createMany: vi.fn() },
      userItem: { deleteMany: vi.fn(), createMany: vi.fn() },
      userStructureUpgrade: { deleteMany: vi.fn(), createMany: vi.fn() },
      userBattleUpgrade: { deleteMany: vi.fn(), createMany: vi.fn() },
      userBonusPoints: { deleteMany: vi.fn(), createMany: vi.fn() },
      attack_log_acl: { deleteMany: vi.fn() },
      attack_log: { deleteMany: vi.fn() },
      bank_history: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        deleteMany: vi.fn(),
      },
      recruit_history: { deleteMany: vi.fn() },
      alliance_bank_history: { deleteMany: vi.fn() },
      alliance_wars: { deleteMany: vi.fn() },
      alliance_join_requests: { deleteMany: vi.fn() },
      alliance_cooldowns: { deleteMany: vi.fn() },
      autoRecruitSession: { deleteMany: vi.fn() },
      userEra: { deleteMany: vi.fn() },
      alliances: { updateMany: vi.fn() },
      alliance_xp: { deleteMany: vi.fn() },
      alliance_upgrades: { deleteMany: vi.fn() },
      responseCache: { deleteMany: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    mockPrisma.$transaction = vi.fn(async (callback: any) => {
      try {
        return await callback(tx);
      } catch (error) {
        tx.rolledBack = true;
        throw error;
      }
    });
  });

  afterEach(() => {
    auditSpy.mockRestore();
    delete require.cache[require.resolve('../CurrentEraReset.service')];
  });

  it('resets players and current-era history without creating a completed-era snapshot', async () => {
    const result = await resetCurrentEra({
      eraId: 7,
      expectedEraStartDate: startDate,
      confirmation: 'RESET ERA 7',
      adminUserId: 1,
      ip: '127.0.0.1',
    });

    expect(result).toMatchObject({
      eraId: 7,
      resetUserCount: 1,
      loginEnabled: false,
    });
    expect(tx.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: expect.objectContaining({
          currentEraId: 7,
          rank: 0,
          stats: [],
          last_active: null,
        }),
      }),
    );
    expect(tx.attack_log.deleteMany).toHaveBeenCalledWith({
      where: { timestamp: { gte: startDate } },
    });
    expect(tx.userEra.deleteMany).toHaveBeenCalledWith({ where: { eraId: 7 } });
    expect(tx.responseCache.deleteMany).toHaveBeenCalledWith({
      where: {
        key: {
          in: [
            'compareTop:7:true',
            'compareTop:7:false',
            'community:stats:history:era:7:v1',
          ],
        },
      },
    });
    expect(tx.alliance_wars.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { created_at: { gte: startDate } },
          { status: { in: ['WARMUP', 'ACTIVE', 'COOLDOWN'] } },
        ],
      },
    });
    expect(tx.era.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    );
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        action: 'ADMIN_CURRENT_ERA_RESET',
        entityId: 7,
      }),
      tx,
    );
  });

  it('resets accounts to the chosen starting settings and saves them to the era', async () => {
    const startSettings = { gold: '45000', citizens: 80, attackTurns: 60 };
    await resetCurrentEra({
      eraId: 7,
      expectedEraStartDate: startDate,
      confirmation: 'RESET ERA 7',
      startSettings,
      adminUserId: 1,
      ip: '127.0.0.1',
    });

    expect(tx.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gold: 45000n, attack_turns: 60 }),
      }),
    );
    expect(tx.userUnit.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ type: 'CITIZEN', quantity: 80 }),
      ]),
    });
    expect(tx.era.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ startSettings }),
      }),
    );
  });

  it('falls back to the era saved settings when none are chosen', async () => {
    tx.era.findFirst.mockResolvedValue({
      id: 7,
      name: 'Test era',
      startDate,
      endDate: null,
      startSettings: { gold: '30000', citizens: 50, attackTurns: 50 },
    });
    await resetCurrentEra({
      eraId: 7,
      expectedEraStartDate: startDate,
      confirmation: 'RESET ERA 7',
      adminUserId: 1,
      ip: '127.0.0.1',
    });

    expect(tx.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gold: 30000n }),
      }),
    );
  });

  it('refuses a stale era id before making changes', async () => {
    await expect(
      resetCurrentEra({
        eraId: 6,
        expectedEraStartDate: startDate,
        confirmation: 'RESET ERA 6',
        adminUserId: 1,
        ip: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(CurrentEraResetError);
    expect(tx.users.update).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation', async () => {
    await expect(
      resetCurrentEra({
        eraId: 7,
        expectedEraStartDate: startDate,
        confirmation: 'wrong',
        adminUserId: 1,
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('Explicit confirmation');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a stale start date even when the era id is unchanged', async () => {
    await expect(
      resetCurrentEra({
        eraId: 7,
        expectedEraStartDate: new Date('2026-01-02T00:00:00Z'),
        confirmation: 'RESET ERA 7',
        adminUserId: 1,
        ip: '127.0.0.1',
      }),
    ).rejects.toMatchObject({ code: 'STALE_ERA' });
    expect(tx.users.update).not.toHaveBeenCalled();
  });

  it('ignores a leftover feature flag row and refuses while the login setting is on', async () => {
    tx.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    tx.serverSetting.findUnique.mockResolvedValue({ value: false });

    await expect(
      resetCurrentEra({
        eraId: 7,
        expectedEraStartDate: startDate,
        confirmation: 'RESET ERA 7',
        adminUserId: 1,
        ip: '127.0.0.1',
      }),
    ).rejects.toMatchObject({ code: 'LOGINS_ENABLED' });
    expect(tx.users.update).not.toHaveBeenCalled();
  });

  it('cancels pending friend requests from before the current era', async () => {
    tx.bank_history.findMany.mockResolvedValue([
      {
        id: 55,
        stats: { transferType: 'FRIEND_REQUEST', senderNote: 'old request' },
      },
    ]);

    await resetCurrentEra({
      eraId: 7,
      expectedEraStartDate: startDate,
      confirmation: 'RESET ERA 7',
      adminUserId: 1,
      ip: '127.0.0.1',
    });

    expect(tx.bank_history.update).toHaveBeenCalledWith({
      where: { id: 55 },
      data: {
        stats: expect.objectContaining({
          transferType: 'FRIEND_REQUEST_CANCELLED',
          senderNote: 'old request',
        }),
      },
    });
  });

  it('opens logins by writing the setting after the reset succeeds', async () => {
    const order: string[] = [];
    tx.era.update.mockImplementation(async () => order.push('reset'));
    tx.serverSetting.upsert.mockImplementation(async () =>
      order.push('setting'),
    );
    auditSpy.mockImplementation(async () => {
      order.push('audit');
    });

    const result = await resetCurrentEra({
      eraId: 7,
      expectedEraStartDate: startDate,
      confirmation: 'RESET ERA 7',
      enableLogins: true,
      adminUserId: 1,
      ip: '127.0.0.1',
    });

    expect(result.loginEnabled).toBe(true);
    expect(order).toEqual(['reset', 'setting', 'audit']);
    expect(tx.serverSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: false, updatedByUserId: 1 } }),
    );
    expect(tx.featureFlag.upsert).not.toHaveBeenCalled();
  });

  it('fails the transaction if the login setting write fails', async () => {
    tx.serverSetting.upsert.mockRejectedValue(new Error('write failed'));

    await expect(
      resetCurrentEra({
        eraId: 7,
        expectedEraStartDate: startDate,
        confirmation: 'RESET ERA 7',
        enableLogins: true,
        adminUserId: 1,
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('write failed');
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.rolledBack).toBe(true);
  });

  it('fails the transaction if the strict audit write fails', async () => {
    auditSpy.mockRejectedValue(new Error('audit unavailable'));

    await expect(
      resetCurrentEra({
        eraId: 7,
        expectedEraStartDate: startDate,
        confirmation: 'RESET ERA 7',
        adminUserId: 1,
        ip: '127.0.0.1',
      }),
    ).rejects.toThrow('audit unavailable');
    expect(tx.rolledBack).toBe(true);
  });
});
