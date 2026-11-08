import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
const { resetRuntimeConfigCache } = require('../RuntimeConfig.service');
const {
  ABUSE_CONFIG_TIMEOUT_MS,
  getAbuseConfigBounded,
  resetAbuseConfigCache,
} = require('../AbuseConfig.service');

const hang = () => {
  mockPrisma.serverSetting.findMany = vi.fn(() => new Promise(() => undefined));
  resetRuntimeConfigCache();
};

beforeEach(() => {
  resetRuntimeConfigCache();
  resetAbuseConfigCache();
  mockPrisma.serverSetting.findMany = vi.fn(async () => []);
});

describe('getAbuseConfigBounded', () => {
  it('returns the live configuration when the read is healthy', async () => {
    const config = await getAbuseConfigBounded();
    expect(config.enabled).toBe(true);
    expect(config.network.minAccounts).toBe(3);
  });

  it('gives up on a hung configuration read instead of waiting forever', async () => {
    vi.useFakeTimers();
    try {
      hang();
      const pending = getAbuseConfigBounded();
      vi.advanceTimersByTime(ABUSE_CONFIG_TIMEOUT_MS + 10);
      // No configuration was ever seen: callers treat detection as disabled.
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the last known configuration when a later read hangs', async () => {
    mockPrisma.serverSetting.findMany = vi.fn(async () => [
      { key: 'abuse.network.minAccounts', value: 6 },
    ]);
    expect((await getAbuseConfigBounded()).network.minAccounts).toBe(6);
    vi.useFakeTimers();
    try {
      hang();
      const pending = getAbuseConfigBounded();
      vi.advanceTimersByTime(ABUSE_CONFIG_TIMEOUT_MS + 10);
      expect((await pending).network.minAccounts).toBe(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a failing read like a timeout', async () => {
    mockPrisma.serverSetting.findMany = vi.fn(async () => {
      throw new Error('db down');
    });
    await expect(getAbuseConfigBounded()).resolves.toBeNull();
  });
});
