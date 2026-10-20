import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { CheatDetectionService } = require('../CheatDetection.service');
const { loginIpHash } = require('../LoginTelemetry.service');

const original = process.env.TRUSTED_PROXY_IPS;

describe('multi-account clusters', () => {
  beforeEach(() => {
    process.env.TRUSTED_PROXY_IPS = '10.0.0.21';
    mockPrisma.users.findMany = vi.fn(async () => []);
  });
  afterEach(() => {
    if (original === undefined) delete process.env.TRUSTED_PROXY_IPS;
    else process.env.TRUSTED_PROXY_IPS = original;
  });

  it('ignores logins recorded with our own proxy address', async () => {
    const proxy = loginIpHash('10.0.0.21');
    const shared = loginIpHash('203.0.113.9');
    mockPrisma.loginEvent = {
      findMany: vi.fn(async () => [
        ...[1, 2, 3, 4].map((userId) => ({
          userId,
          ipHash: proxy,
          deviceHash: 'proxy-device',
        })),
        ...[5, 6, 7].map((userId) => ({
          userId,
          ipHash: shared,
          deviceHash: null,
        })),
      ]),
    };
    const clusters = await CheatDetectionService.getMultiAccountClusters();
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ type: 'IP', userIds: [5, 6, 7] });
  });
});
