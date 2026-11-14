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
  loginIpPrefixHash,
  proxyLoginIpHashes,
  pruneLoginTelemetry,
  raiseLoginClusterSignal,
  recordSuccessfulLogin,
  recordSignUpTelemetry,
  recordDailySeenActivity,
  settleLoginChecks,
  findLoginClusters,
} = require('../LoginTelemetry.service');
const { eraseRemainingPersonalData } = require('../PrivacyRetention.service');

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

describe('network range telemetry', () => {
  it('hashes the IPv4 /24: same range, different hosts, one hash', async () => {
    await recordSuccessfulLogin({ userId: 21, ip: '203.0.113.9' });
    await recordSuccessfulLogin({ userId: 22, ip: '203.0.113.200' });
    await recordSuccessfulLogin({ userId: 23, ip: '198.51.100.7' });

    const rows = mockPrisma.loginEvent.create.mock.calls.map(
      (call: any) => call[0].data,
    );
    expect(rows[0].ipPrefixHash).toBe(rows[1].ipPrefixHash);
    expect(rows[0].ipPrefixHash).not.toBe(rows[2].ipPrefixHash);
    for (const row of rows) {
      expect(row.ipPrefixHash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.ipPrefixHash).not.toContain('203.0.113');
      expect(row.ipPrefixHash).not.toContain('198.51.100');
    }
  });

  it('hashes the IPv6 /64 and ignores host bits', () => {
    const a = loginIpPrefixHash('2001:db8:1234:5678::1');
    const b = loginIpPrefixHash('2001:DB8:1234:5678:AAAA::FFFF');
    const other = loginIpPrefixHash('2001:db8:1234:5679::1');
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(other);
    expect(loginIpPrefixHash('not-an-ip')).toBeNull();
    expect(loginIpPrefixHash(undefined)).toBeNull();
  });

  it('never derives a range from our own proxy address', async () => {
    const original = process.env.TRUSTED_PROXY_IPS;
    process.env.TRUSTED_PROXY_IPS = '10.0.0.21';
    try {
      await recordSuccessfulLogin({
        userId: 31,
        ip: '10.0.0.21',
        userAgent: 'Synthetic Browser',
      });
      await settleLoginChecks();
      const stored = mockPrisma.loginEvent.create.mock.calls[0][0].data;
      expect(stored.deviceHash).toBeNull();
      expect(stored.ipPrefixHash).toBeNull();
    } finally {
      if (original === undefined) delete process.env.TRUSTED_PROXY_IPS;
      else process.env.TRUSTED_PROXY_IPS = original;
    }
  });
});

describe('sign-up telemetry', () => {
  it('stores the same salted hashes with kind SIGN_UP and runs no signal check', async () => {
    await recordSignUpTelemetry({
      userId: 41,
      ip: '203.0.113.41',
      userAgent: 'Synthetic Browser',
    });
    await settleLoginChecks();

    const stored = mockPrisma.loginEvent.create.mock.calls[0][0].data;
    expect(stored.kind).toBe('SIGN_UP');
    expect(stored.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.ipPrefixHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.userAgentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.deviceHash).toMatch(/^[a-f0-9]{64}$/);
    // A registration is review context; no abuse signal may come of it.
    expect(mockPrisma.cheatSignal.create).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('daily seen telemetry', () => {
  const insertCalls = () =>
    (mockPrisma.$transaction.mock.calls as any[][])
      .map(([, fn]) => fn)
      .filter(Boolean);

  it('writes at most one SEEN row per user per UTC day', async () => {
    const day = new Date('2026-11-12T09:30:00.000Z');
    await recordDailySeenActivity({
      userId: 51,
      ip: '203.0.113.51',
      userAgent: 'Synthetic Browser',
      now: day,
    });
    await recordDailySeenActivity({
      userId: 51,
      ip: '203.0.113.51',
      userAgent: 'Synthetic Browser',
      now: new Date('2026-11-12T22:59:00.000Z'),
    });
    // The in-memory guard holds: one insert statement for the whole UTC day.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    // Next UTC day: exactly one more insert.
    await recordDailySeenActivity({
      userId: 51,
      ip: '203.0.113.51',
      now: new Date('2026-11-13T00:15:00.000Z'),
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);

    // Another user the same day is still recorded.
    await recordDailySeenActivity({
      userId: 52,
      ip: '203.0.113.52',
      now: new Date('2026-11-13T01:15:00.000Z'),
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    expect(insertCalls().length).toBe(3);
  });

  it('insert is idempotent and stores kind SEEN with hashes only', async () => {
    await recordDailySeenActivity({
      userId: 53,
      ip: '203.0.113.53',
      userAgent: 'Synthetic Browser',
      now: new Date('2026-11-12T12:00:00.000Z'),
    });
    const [run] = mockPrisma.$transaction.mock.calls[0];
    const tx = {
      $executeRaw: vi.fn(async () => 1),
    };
    await run(tx);
    const insert = tx.$executeRaw.mock.calls
      .map((call: any[]) => call[0].join(''))
      .find((text: string) => text.includes('INSERT INTO "LoginEvent"'));
    expect(insert).toContain('NOT EXISTS');
    const flat = JSON.stringify(tx.$executeRaw.mock.calls);
    expect(flat).toContain('SEEN');
    expect(flat).not.toContain('203.0.113.53');
  });

  it('never throws when the insert fails', async () => {
    mockPrisma.$transaction = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    await expect(
      recordDailySeenActivity({
        userId: 54,
        ip: '203.0.113.54',
        now: new Date('2026-11-12T12:00:00.000Z'),
      }),
    ).resolves.toBeUndefined();
  });
});

describe('range clusters stay review context', () => {
  it('a range cluster raises no signal even above the account threshold', async () => {
    const result = await raiseLoginClusterSignal(
      {
        via: 'range',
        hash: 'd'.repeat(64),
        userIds: [61, 62, 63, 64],
      },
      { minAccounts: 3, windowDays: 14 },
      new Date(),
    );
    expect(result).toBeNull();
    expect(mockPrisma.cheatSignal.create).not.toHaveBeenCalled();
  });

  it('cluster lookups cover the range column only when asked', async () => {
    await findLoginClusters({
      since: new Date('2026-11-01T00:00:00.000Z'),
      minAccounts: 2,
    });
    let statements = mockPrisma.$queryRaw.mock.calls.map((call: any[]) =>
      JSON.stringify(call),
    );
    // Default (signal paths): ip and device only, behaviour unchanged.
    expect(statements).toHaveLength(2);
    expect(statements.join(' ')).not.toContain('ipPrefixHash');

    mockPrisma.$queryRaw.mockClear();
    await findLoginClusters({
      since: new Date('2026-11-01T00:00:00.000Z'),
      minAccounts: 2,
      vias: ['ip', 'device', 'range'],
    });
    statements = mockPrisma.$queryRaw.mock.calls.map((call: any[]) =>
      JSON.stringify(call),
    );
    expect(statements).toHaveLength(3);
    expect(statements[2]).toContain('ipPrefixHash');
  });
});

describe('retention and erasure cover every event kind', () => {
  it('prunes by age only, never by kind', () => {
    pruneLoginTelemetry(new Date('2026-11-12T00:00:00.000Z'));
    expect(mockPrisma.loginEvent.deleteMany).toHaveBeenCalledWith({
      where: { occurredAt: { lt: new Date('2026-10-13T00:00:00.000Z') } },
    });
  });

  it('erasure deletes every login event of the user, whatever its kind', async () => {
    const tx = {
      loginEvent: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      auditLog: { updateMany: vi.fn(async () => ({ count: 0 })) },
      recruit_history: { updateMany: vi.fn(async () => ({ count: 0 })) },
      social: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      post_read_status: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      autoRecruitSession: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      chatRoomParticipant: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      chatMessageReaction: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      chatMessageReadStatus: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      chatMute: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      emailOutbox: { updateMany: vi.fn(async () => ({ count: 0 })) },
      apiTokenAudit: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      apiToken: { updateMany: vi.fn(async () => ({ count: 0 })) },
      apiClient: { updateMany: vi.fn(async () => ({ count: 0 })) },
      accountDataExport: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      alliance_bank_history: { updateMany: vi.fn(async () => ({ count: 0 })) },
      alliance_gold_requests: { updateMany: vi.fn(async () => ({ count: 0 })) },
      alliance_loans: { updateMany: vi.fn(async () => ({ count: 0 })) },
      alliance_list_entries: { updateMany: vi.fn(async () => ({ count: 0 })) },
      alliance_target_calls: { updateMany: vi.fn(async () => ({ count: 0 })) },
      alliance_intel_shares: { updateMany: vi.fn(async () => ({ count: 0 })) },
      activityDay: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      cheatSignal: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      moderatorNote: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      banAppeal: { updateMany: vi.fn(async () => ({ count: 0 })) },
      report: { updateMany: vi.fn(async () => ({ count: 0 })) },
      $executeRaw: vi.fn(async () => 0),
    };
    await eraseRemainingPersonalData(tx, 71, { sanctionInEffect: false });
    expect(tx.loginEvent.deleteMany).toHaveBeenCalledWith({
      where: { userId: 71 },
    });
    // No kind narrowing: SEEN, SIGN_UP and SIGN_IN rows all go.
    expect(tx.loginEvent.deleteMany.mock.calls[0][0].where).not.toHaveProperty(
      'kind',
    );
  });
});
