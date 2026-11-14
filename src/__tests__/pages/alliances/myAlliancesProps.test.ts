import { describe, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
// The suite runs with --isolate, so these stubs cannot reach other files.
const realNextAuth = await import('next-auth');
mock.module('next-auth', () => ({
  ...realNextAuth,
  default: realNextAuth.default,
  getServerSession: async () => ({ user: { id: 2 } }),
}));
mock.module('@/utils/serverTranslations', () => ({
  serverSideTranslations: async () => ({}),
}));
const { getServerSideProps } = await import('@/pages/alliances/index');

describe('My Alliances server props', () => {
  it('never returns undefined premium fields, which Next cannot serialize', async () => {
    mockPrisma.alliance_memberships = {
      findMany: vi.fn(async () => [
        {
          id: 1,
          alliance_id: 1,
          user_id: 2,
          role: { name: 'Leader', permissions: {} },
          alliance: {
            id: 1,
            name: 'Gate Order',
            status: 'ACTIVE',
            leader_id: 2,
            avatar: null,
            bannerimg: null,
            motto: null,
            gold_in_bank: 0n,
            _count: { members: 1 },
          },
        },
      ]),
    };
    const result: any = await getServerSideProps({
      req: {},
      res: {},
      locale: 'en',
      defaultLocale: 'en',
    } as any);
    const [alliance] = result.props.myAlliances;
    expect(alliance.isPremium).toBe(false);
    expect(alliance.premiumUntil).toBeNull();
    // The props survive a JSON round trip unchanged (no undefined values).
    expect(JSON.parse(JSON.stringify(alliance))).toEqual(alliance);
  });
});
