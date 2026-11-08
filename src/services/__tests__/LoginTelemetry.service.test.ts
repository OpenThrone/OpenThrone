import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { resetRuntimeConfigCache } = require('../RuntimeConfig.service');
const {
  ABUSE_CONFIG_TIMEOUT_MS,
  resetAbuseConfigCache,
} = require('../AbuseConfig.service');
const {
  loginIpHash,
  proxyLoginIpHashes,
  pruneLoginTelemetry,
  recordSuccessfulLogin,
  settleLoginChecks,
} = require('../LoginTelemetry.service');

beforeEach(() => {
  resetRuntimeConfigCache();
  resetAbuseConfigCache();
  mockPrisma.loginEvent = {
    create: vi.fn(async () => ({})),
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.serverSetting = { findMany: vi.fn(async () => []) };
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.cheatSignal = {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
  };
  mockPrisma.$transaction = vi.fn(async (callback: (tx: any) => unknown) =>
    callback({
      $executeRaw: vi.fn(async () => 0),
      $queryRaw: (...args: unknown[]) => mockPrisma.$queryRaw(...args),
      loginEvent: mockPrisma.loginEvent,
      cheatSignal: mockPrisma.cheatSignal,
    }),
  );
});

describe('privacy-preserving login telemetry', () => {
  it('persists only salted hashes of the IP and client identifiers', async () => {
    await recordSuccessfulLogin({
      userId: 42,
      ip: '203.0.113.9',
      userAgent: 'Synthetic Browser/1.0',
    });
    await settleLoginChecks();

    const stored = mockPrisma.loginEvent.create.mock.calls[0][0].data;
    expect(stored.ipHash).not.toContain('203.0.113.9');
    expect(stored.userAgentHash).not.toContain('Synthetic Browser/1.0');
    expect(stored.deviceHash).not.toContain('Synthetic Browser/1.0');
    expect(stored.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.userAgentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('never links accounts by a login that resolved to our own proxy', async () => {
    const original = process.env.TRUSTED_PROXY_IPS;
    process.env.TRUSTED_PROXY_IPS = '10.0.0.21';
    try {
      await recordSuccessfulLogin({
        userId: 7,
        ip: '10.0.0.21',
        userAgent: 'Synthetic Browser',
      });
      await settleLoginChecks();
      const stored = mockPrisma.loginEvent.create.mock.calls[0][0].data;
      expect(stored.deviceHash).toBeNull();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(proxyLoginIpHashes().has(stored.ipHash)).toBe(true);
      expect(proxyLoginIpHashes().has(loginIpHash('203.0.113.9'))).toBe(false);
    } finally {
      if (original === undefined) delete process.env.TRUSTED_PROXY_IPS;
      else process.env.TRUSTED_PROXY_IPS = original;
    }
  });

  it('files review-only signals only after three distinct accounts share a network/browser pattern', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { hash: 'a'.repeat(64), users: [12, 13, 14] },
    ]);
    await recordSuccessfulLogin({
      userId: 14,
      ip: '203.0.113.14',
      userAgent: 'Synthetic Browser',
    });
    await settleLoginChecks();

    // One signal for the shared address and one for the address+browser pattern.
    expect(mockPrisma.cheatSignal.create).toHaveBeenCalledTimes(2);
    const signal = mockPrisma.cheatSignal.create.mock.calls[0][0].data;
    expect(signal.type).toBe('LINKED_ACCOUNT_ACTIVITY');
    expect(signal.severity).toBe('LOW');
    expect(signal.userId).toBe(12);
    expect(signal.linkedUserIds).toEqual([13, 14]);
    expect(signal.evidence).not.toHaveProperty('deviceHash');
    expect(JSON.stringify(signal.evidence)).not.toContain('a'.repeat(64));
    expect(signal.summary).toContain('same network');
  });

  it('files nothing when fewer accounts than the configured minimum share a pattern', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { hash: 'b'.repeat(64), users: [12, 14] },
    ]);
    await recordSuccessfulLogin({
      userId: 14,
      ip: '203.0.113.14',
      userAgent: 'Synthetic Browser',
    });
    await settleLoginChecks();
    expect(mockPrisma.cheatSignal.create).not.toHaveBeenCalled();

    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'abuse.network.minAccounts', value: 2 },
    ]);
    resetRuntimeConfigCache();
    await recordSuccessfulLogin({
      userId: 14,
      ip: '203.0.113.14',
      userAgent: 'Synthetic Browser',
    });
    await settleLoginChecks();
    expect(mockPrisma.cheatSignal.create).toHaveBeenCalled();
  });

  it('does not infer a shared pattern from a User-Agent without a resolved IP', async () => {
    await recordSuccessfulLogin({
      userId: 42,
      userAgent: 'Synthetic Browser/1.0',
    });
    await settleLoginChecks();

    const stored = mockPrisma.loginEvent.create.mock.calls[0][0].data;
    expect(stored.deviceHash).toBeNull();
    expect(mockPrisma.cheatSignal.create).not.toHaveBeenCalled();
  });

  it('refreshes rather than duplicates an open or acknowledged pattern signal', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { hash: 'c'.repeat(64), users: [12, 13, 14] },
    ]);
    mockPrisma.cheatSignal.findFirst.mockResolvedValue({
      id: 3,
      userId: 12,
      score: 15,
    });
    await recordSuccessfulLogin({
      userId: 14,
      ip: '203.0.113.14',
      userAgent: 'Synthetic Browser',
    });
    await settleLoginChecks();

    expect(mockPrisma.cheatSignal.create).not.toHaveBeenCalled();
    expect(mockPrisma.cheatSignal.update).toHaveBeenCalledTimes(2);
  });

  it('prunes records older than the 30-day retention cutoff', async () => {
    const now = new Date('2026-10-09T00:00:00.000Z');
    mockPrisma.loginEvent.deleteMany.mockResolvedValueOnce({ count: 4 });

    expect(await pruneLoginTelemetry(now)).toBe(4);
    expect(mockPrisma.loginEvent.deleteMany).toHaveBeenCalledWith({
      where: { occurredAt: { lt: new Date('2026-09-09T00:00:00.000Z') } },
    });
  });

  it('never makes the sign-in wait on a stalled detector', async () => {
    const stalled: Array<(value: unknown) => void> = [];
    mockPrisma.$transaction = vi.fn(
      () =>
        new Promise((resolve) => {
          stalled.push(resolve); // stalls until the test lets go
        }),
    );
    const outcome = await Promise.race([
      recordSuccessfulLogin({
        userId: 14,
        ip: '203.0.113.14',
        userAgent: 'Synthetic Browser',
      }).then(() => 'returned'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 500)),
    ]);
    expect(outcome).toBe('returned');
    expect(mockPrisma.loginEvent.create).toHaveBeenCalledTimes(1);
    // Let go only once the background job is actually stuck in the transaction.
    while (stalled.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 5));
    mockPrisma.$transaction = vi.fn(async () => []);
    for (const resolve of stalled) resolve([]);
    await settleLoginChecks(); // the stalled check finishes quietly afterwards
  });

  it('a hung configuration read never holds a login-check slot past its bound', async () => {
    vi.useFakeTimers();
    try {
      mockPrisma.serverSetting.findMany = vi.fn(
        () => new Promise(() => undefined),
      );
      resetRuntimeConfigCache();
      await recordSuccessfulLogin({
        userId: 14,
        ip: '203.0.113.14',
        userAgent: 'Synthetic Browser',
      });
      vi.advanceTimersByTime(ABUSE_CONFIG_TIMEOUT_MS + 10);
      await settleLoginChecks();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
