import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { CheatDetectionService } = require('../CheatDetection.service');
const { loginIpHash, loginIpPrefixHash } = require('../LoginTelemetry.service');

const original = process.env.TRUSTED_PROXY_IPS;

describe('multi-account clusters', () => {
  beforeEach(() => {
    process.env.TRUSTED_PROXY_IPS = '10.0.0.21';
    mockPrisma.users.findMany = vi.fn(async () => []);
    mockPrisma.loginEvent = {
      findMany: vi.fn(async () => []),
    };
  });
  afterEach(() => {
    if (original === undefined) delete process.env.TRUSTED_PROXY_IPS;
    else process.env.TRUSTED_PROXY_IPS = original;
  });

  it('ignores logins recorded with our own proxy address', async () => {
    const proxy = loginIpHash('10.0.0.21');
    const shared = loginIpHash('203.0.113.9');
    mockPrisma.loginEvent.findMany = vi.fn(async () => [
      ...[1, 2, 3, 4].map((userId) => ({
        userId,
        ipHash: proxy,
        ipPrefixHash: null,
        deviceHash: 'proxy-device',
        kind: 'SIGN_IN',
        occurredAt: new Date('2026-11-10T08:00:00.000Z'),
      })),
      ...[5, 6, 7].map((userId) => ({
        userId,
        ipHash: shared,
        ipPrefixHash: loginIpPrefixHash('203.0.113.9'),
        deviceHash: null,
        kind: 'SIGN_IN',
        occurredAt: new Date('2026-11-10T08:00:00.000Z'),
      })),
    ]);
    const clusters = await CheatDetectionService.getMultiAccountClusters();
    // The proxy group never forms; the shared-address group does, plus the
    // /24 range group (203.0.113.0/24 covers both proxy-free rows' users).
    const types = clusters.map((c: { type: string }) => c.type).sort();
    expect(types).toEqual(['IP', 'IP_RANGE']);
    const ip = clusters.find((c: { type: string }) => c.type === 'IP');
    expect(ip).toMatchObject({ userIds: [5, 6, 7] });
  });

  it('shows pairs: two accounts on one address are staff-visible context', async () => {
    const shared = loginIpHash('203.0.113.9');
    mockPrisma.loginEvent.findMany = vi.fn(async () => [
      {
        userId: 11,
        ipHash: shared,
        ipPrefixHash: loginIpPrefixHash('203.0.113.9'),
        deviceHash: null,
        kind: 'SIGN_IN',
        occurredAt: new Date('2026-11-10T08:00:00.000Z'),
      },
      {
        userId: 12,
        ipHash: shared,
        ipPrefixHash: loginIpPrefixHash('203.0.113.9'),
        deviceHash: null,
        kind: 'SIGN_UP',
        occurredAt: new Date('2026-11-11T09:30:00.000Z'),
      },
    ]);
    const clusters = await CheatDetectionService.getMultiAccountClusters();
    expect(clusters).toHaveLength(2); // the IP pair and the range pair
    const ip = clusters.find((c: { type: string }) => c.type === 'IP');
    expect(ip).toMatchObject({ userIds: [11, 12] });
    expect(ip.kinds).toEqual(['SIGN_IN', 'SIGN_UP']);
    // The API layer serializes these to ISO strings.
    expect(new Date(ip.firstSeen).toISOString()).toBe(
      '2026-11-10T08:00:00.000Z',
    );
    expect(new Date(ip.lastSeen).toISOString()).toBe(
      '2026-11-11T09:30:00.000Z',
    );
  });

  it('groups accounts that only share a network range, with kinds and dates', async () => {
    mockPrisma.loginEvent.findMany = vi.fn(async () => [
      {
        userId: 21,
        ipHash: loginIpHash('198.51.100.21'),
        ipPrefixHash: loginIpPrefixHash('198.51.100.21'),
        deviceHash: null,
        kind: 'SIGN_IN',
        occurredAt: new Date('2026-11-09T10:00:00.000Z'),
      },
      {
        userId: 22,
        ipHash: loginIpHash('198.51.100.22'),
        ipPrefixHash: loginIpPrefixHash('198.51.100.22'),
        deviceHash: null,
        kind: 'SEEN',
        occurredAt: new Date('2026-11-12T19:00:00.000Z'),
      },
    ]);
    const clusters = await CheatDetectionService.getMultiAccountClusters();
    // Different full addresses, same /24: only the range cluster appears.
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      type: 'IP_RANGE',
      userIds: [21, 22],
      kinds: ['SEEN', 'SIGN_IN'],
    });
    expect(new Date(clusters[0].firstSeen).toISOString()).toBe(
      '2026-11-09T10:00:00.000Z',
    );
    expect(new Date(clusters[0].lastSeen).toISOString()).toBe(
      '2026-11-12T19:00:00.000Z',
    );
  });
});
