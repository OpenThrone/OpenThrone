import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const {
  loginIpHash,
  proxyLoginIpHashes,
  pruneLoginTelemetry,
  recordSuccessfulLogin,
} = require('../LoginTelemetry.service');

beforeEach(() => {
  mockPrisma.loginEvent = {
    create: vi.fn(async () => ({})),
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.cheatSignal = {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
  };
  mockPrisma.$transaction = vi.fn(async (callback: (tx: any) => unknown) =>
    callback({
      $queryRaw: vi.fn(async () => []),
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

  it('creates review-only signals only after three distinct accounts share a network/browser pattern', async () => {
    mockPrisma.loginEvent.findMany.mockResolvedValueOnce([
      { userId: 12 },
      { userId: 13 },
      { userId: 14 },
    ]);
    await recordSuccessfulLogin({
      userId: 14,
      ip: '203.0.113.14',
      userAgent: 'Synthetic Browser',
    });

    expect(mockPrisma.cheatSignal.create).toHaveBeenCalledTimes(3);
    const signal = mockPrisma.cheatSignal.create.mock.calls[0][0].data;
    expect(signal.type).toBe('LINKED_ACCOUNT_ACTIVITY');
    expect(signal.severity).toBe('LOW');
    expect(signal.score).toBe(1);
    expect(signal.evidence).not.toHaveProperty('deviceHash');
    expect(signal.summary).toContain('shares a network/browser pattern');
  });

  it('does not infer a shared pattern from a User-Agent without a resolved IP', async () => {
    await recordSuccessfulLogin({
      userId: 42,
      userAgent: 'Synthetic Browser/1.0',
    });

    const stored = mockPrisma.loginEvent.create.mock.calls[0][0].data;
    expect(stored.deviceHash).toBeNull();
    expect(mockPrisma.loginEvent.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.cheatSignal.create).not.toHaveBeenCalled();
  });

  it('refreshes rather than duplicates an open or acknowledged pattern signal', async () => {
    mockPrisma.loginEvent.findMany.mockResolvedValueOnce([
      { userId: 12 },
      { userId: 13 },
      { userId: 14 },
    ]);
    mockPrisma.cheatSignal.findFirst.mockResolvedValue({ id: 3 });
    await recordSuccessfulLogin({
      userId: 14,
      ip: '203.0.113.14',
      userAgent: 'Synthetic Browser',
    });

    expect(mockPrisma.cheatSignal.create).not.toHaveBeenCalled();
    expect(mockPrisma.cheatSignal.update).toHaveBeenCalledTimes(3);
  });

  it('prunes records older than the 30-day retention cutoff', async () => {
    const now = new Date('2026-10-09T00:00:00.000Z');
    mockPrisma.loginEvent.deleteMany.mockResolvedValueOnce({ count: 4 });

    expect(await pruneLoginTelemetry(now)).toBe(4);
    expect(mockPrisma.loginEvent.deleteMany).toHaveBeenCalledWith({
      where: { occurredAt: { lt: new Date('2026-09-09T00:00:00.000Z') } },
    });
  });
});
