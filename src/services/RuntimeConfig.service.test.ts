import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
const {
  getRuntimeConfig,
  invalidateRuntimeConfigCache,
  resetRuntimeConfigCache,
} = await import('@/services/RuntimeConfig.service');

const ENV_KEYS = [
  'NEXT_PUBLIC_ENABLE_ATTACKING',
  'NEXT_PUBLIC_ATTACK_LEVEL_RANGE',
  'NEXT_PUBLIC_ENABLE_SOCIAL',
  'NEXT_PUBLIC_DISABLE_LOGIN',
];
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

describe('runtime config snapshot', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    resetMockPrisma();
    resetRuntimeConfigCache();
    mockPrisma.serverSetting.findMany = vi.fn().mockResolvedValue([]);
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    dateNowSpy?.mockRestore();
    dateNowSpy = undefined;
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetRuntimeConfigCache();
  });

  it('layers validated database values over environment fallbacks and ignores feature flag rows', async () => {
    process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE = '8';
    process.env.NEXT_PUBLIC_DISABLE_LOGIN = 'true';
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'ENABLE_ATTACKING', value: false },
      { key: 'ATTACK_LEVEL_RANGE', value: 101 },
      { key: 'MAINTENANCE_MODE', value: { enabled: true, message: 'Planned' } },
      { key: 'DATABASE_URL', value: 'must not be projected' },
    ]);
    mockPrisma.featureFlag.findMany = vi
      .fn()
      .mockResolvedValue([{ key: 'ENABLE_ATTACKING', enabled: true }]);

    const config = await getRuntimeConfig();

    expect(config.enableAttacking).toBe(false);
    expect(config.attackLevelRange).toBe(8);
    expect(config.disableLogin).toBe(true);
    expect(mockPrisma.featureFlag.findMany).not.toHaveBeenCalled();
    expect(config.maintenance).toEqual({ enabled: true, message: 'Planned' });
    expect(config.recruitDailyCap).toBe(250);
    expect(config.externalRecruitDailyCap).toBe(25);
    expect(config.externalRecruitIpDailyCap).toBe(5);
    expect(config).not.toHaveProperty('DATABASE_URL');
  });

  it('loads recruitment allowances independently from stored settings', async () => {
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'recruit.internalDailyCap', value: 400 },
      { key: 'recruit.dailyCap', value: 30 },
      { key: 'recruit.externalIpDailyCap', value: 3 },
    ]);

    const config = await getRuntimeConfig();

    expect(config.recruitDailyCap).toBe(400);
    expect(config.externalRecruitDailyCap).toBe(30);
    expect(config.externalRecruitIpDailyCap).toBe(3);
  });

  it('caches for five seconds and reloads after explicit invalidation', async () => {
    let now = 1000;
    dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    mockPrisma.serverSetting.findMany
      .mockResolvedValueOnce([{ key: 'ENABLE_ATTACKING', value: false }])
      .mockResolvedValueOnce([{ key: 'ENABLE_ATTACKING', value: true }]);

    expect((await getRuntimeConfig()).enableAttacking).toBe(false);
    expect((await getRuntimeConfig()).enableAttacking).toBe(false);
    expect(mockPrisma.serverSetting.findMany).toHaveBeenCalledTimes(1);

    now += 5001;
    expect((await getRuntimeConfig()).enableAttacking).toBe(true);
    expect(mockPrisma.serverSetting.findMany).toHaveBeenCalledTimes(2);

    invalidateRuntimeConfigCache();
    mockPrisma.serverSetting.findMany.mockResolvedValueOnce([
      { key: 'ENABLE_ATTACKING', value: false },
    ]);
    expect((await getRuntimeConfig()).enableAttacking).toBe(false);
  });

  it('retains the last good snapshot during database errors and fails sanitized when none exists', async () => {
    let now = 1000;
    dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    mockPrisma.serverSetting.findMany.mockRejectedValue(
      new Error('synthetic database error'),
    );
    await expect(getRuntimeConfig()).rejects.toThrow(
      'Runtime configuration unavailable',
    );

    resetRuntimeConfigCache();
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'ENABLE_ATTACKING', value: false },
    ]);
    await getRuntimeConfig();
    invalidateRuntimeConfigCache();
    mockPrisma.serverSetting.findMany.mockRejectedValue(
      new Error('synthetic database error'),
    );

    expect((await getRuntimeConfig()).enableAttacking).toBe(false);
    now = 2000;
    expect((await getRuntimeConfig()).enableAttacking).toBe(false);
    now = 32_000;
    await expect(getRuntimeConfig()).rejects.toThrow(
      'Runtime configuration unavailable',
    );
  });

  it('does not let an in-flight pre-invalidation read overwrite the fresh cache', async () => {
    let resolveOld: (rows: unknown[]) => void = () => undefined;
    mockPrisma.serverSetting.findMany
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce([{ key: 'ENABLE_ATTACKING', value: false }]);

    const oldRead = getRuntimeConfig();
    invalidateRuntimeConfigCache();
    expect((await getRuntimeConfig()).enableAttacking).toBe(false);

    resolveOld([{ key: 'ENABLE_ATTACKING', value: true }]);
    await oldRead;
    expect((await getRuntimeConfig()).enableAttacking).toBe(false);
  });

  it('transaction readers bypass global pending work without replacing its cache', async () => {
    let finishGlobal: (rows: unknown[]) => void = () => undefined;
    mockPrisma.serverSetting.findMany.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishGlobal = resolve;
        }),
    );
    const pendingGlobal = getRuntimeConfig();
    const tx = {
      serverSetting: {
        findMany: vi.fn(async () => [
          { key: 'recruit.internalDailyCap', value: 12 },
        ]),
      },
    };
    const transactionConfig = await getRuntimeConfig(tx as any);
    expect(transactionConfig.recruitDailyCap).toBe(12);
    expect(tx.serverSetting.findMany).toHaveBeenCalledTimes(1);
    finishGlobal([{ key: 'recruit.internalDailyCap', value: 250 }]);
    expect((await pendingGlobal).recruitDailyCap).toBe(250);
    expect((await getRuntimeConfig()).recruitDailyCap).toBe(250);
  });

  it('deduplicates reads that share a cache epoch', async () => {
    let resolveRows: (rows: unknown[]) => void = () => undefined;
    mockPrisma.serverSetting.findMany.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRows = resolve;
        }),
    );

    const first = getRuntimeConfig();
    const second = getRuntimeConfig();
    expect(mockPrisma.serverSetting.findMany).toHaveBeenCalledTimes(1);
    resolveRows([{ key: 'ENABLE_ATTACKING', value: false }]);
    expect(await first).toEqual(await second);
    expect(mockPrisma.serverSetting.findMany).toHaveBeenCalledTimes(1);
  });
});
