import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
const { resetRuntimeConfigCache } = require('../RuntimeConfig.service');
const {
  ABUSE_CONFIG_TIMEOUT_MS,
  resetAbuseConfigCache,
} = require('../AbuseConfig.service');
const {
  markGameplayActivity,
  settleActivityWrites,
} = require('../GameplayActivity.service');

const enabled = (value: boolean) =>
  mockPrisma.serverSetting.findMany.mockResolvedValue([
    { key: 'abuse.enabled', value },
  ]);

beforeEach(() => {
  resetRuntimeConfigCache();
  resetAbuseConfigCache();
  mockPrisma.users.update = vi.fn(async () => ({}));
  mockPrisma.$executeRaw = vi.fn(async () => 1);
  mockPrisma.$transaction = vi.fn(async (callback: (tx: any) => unknown) =>
    callback({ $executeRaw: mockPrisma.$executeRaw }),
  );
  enabled(true);
});

describe('gameplay activity counters', () => {
  it('stamps last_gameplay_at and writes the counter row in the background', async () => {
    await markGameplayActivity(5);
    await settleActivityWrites();
    expect(mockPrisma.users.update).toHaveBeenCalledTimes(1);
    const sql = mockPrisma.$executeRaw.mock.calls
      .map((call: any[]) => call[0].join('?'))
      .join('\n');
    expect(sql).toContain('SET LOCAL statement_timeout');
    expect(sql).toContain('INSERT INTO "ActivityDay"');
  });

  it('never makes the gameplay action wait on a stalled counter write', async () => {
    const stalled: Array<(value: unknown) => void> = [];
    mockPrisma.$transaction = vi.fn(
      () =>
        new Promise((resolve) => {
          stalled.push(resolve);
        }),
    );
    const outcome = await Promise.race([
      markGameplayActivity(5).then(() => 'returned'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 500)),
    ]);
    expect(outcome).toBe('returned');
    expect(mockPrisma.users.update).toHaveBeenCalledTimes(1);
    // Let go only once the background job is actually stuck in the transaction.
    while (stalled.length === 0)
      await new Promise((resolve) => setTimeout(resolve, 5));
    mockPrisma.$transaction = vi.fn(async () => []);
    for (const resolve of stalled) resolve([]);
    await settleActivityWrites();
  });

  it('collects nothing while abuse detection is off', async () => {
    enabled(false);
    await markGameplayActivity(5);
    await settleActivityWrites();
    expect(mockPrisma.users.update).toHaveBeenCalledTimes(1); // the bonus stamp still happens
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('a failing counter write never fails the action', async () => {
    mockPrisma.$transaction = vi.fn(async () => {
      throw new Error('deadlock');
    });
    await expect(markGameplayActivity(5)).resolves.toBeUndefined();
    await settleActivityWrites();
  });

  it('a hung configuration read never holds a counter slot past its bound', async () => {
    vi.useFakeTimers();
    try {
      mockPrisma.serverSetting.findMany = vi.fn(
        () => new Promise(() => undefined),
      );
      resetRuntimeConfigCache();
      await markGameplayActivity(5);
      vi.advanceTimersByTime(ABUSE_CONFIG_TIMEOUT_MS + 10);
      // The job gave up on the config and ended: nothing is left in flight.
      await settleActivityWrites();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
