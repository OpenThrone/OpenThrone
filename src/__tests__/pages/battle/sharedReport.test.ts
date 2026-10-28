import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
let session: { user: { id: number } } | null = null;
mock.module('next-auth', () => ({ getServerSession: async () => session }));
mock.module('@/pages/api/auth/[...nextauth]', () => ({ authOptions: {} }));
const { getServerSideProps } = await import('@/pages/battle/results/[id]');
const context = (id = '90') => ({
  params: { id },
  req: {},
  res: { setHeader: vi.fn() },
});
let acl: any[];
beforeEach(() => {
  session = null;
  acl = [];
  mockPrisma.era = {
    findFirst: vi.fn(async () => ({ startDate: new Date('2026-01-01') })),
  };
  mockPrisma.attack_log = {
    findUnique: vi.fn(async () => ({
      id: 90,
      attacker_id: 11,
      defender_id: 12,
      winner: 11,
      timestamp: new Date('2026-10-01'),
      type: 'INTEL',
      acl,
      attackerPlayer: { id: 11, display_name: 'Alice' },
      defenderPlayer: { id: 12, display_name: 'Bob' },
      stats: {
        spyResults: {
          success: true,
          spiesSent: 8,
          spiesLost: 2,
          spyLosses: [{ type: 'SPY', level: 1, quantity: 2 }],
          successProbability: 0.75,
          intelPercentage: 100,
          intelligenceGathered: { gold: '100' },
        },
      },
    })),
  };
  mockPrisma.alliance_memberships = { findFirst: vi.fn(async () => null) };
});
describe('public report server loader', () => {
  it('does not return a private report to an anonymous visitor', async () => {
    const result = await getServerSideProps(context());
    expect(result.props.battle).toBeNull();
  });
  it('returns a public report anonymously using shared redaction and no cache', async () => {
    acl = [{ is_public: true }];
    const request = context();
    const result = await getServerSideProps(request);
    expect(result.props.viewerID).toBe(0);
    expect(result.props.battle?.stats.spyResults).toMatchObject({
      intelPercentage: 100,
      intelligenceGathered: { gold: '100' },
    });
    expect(result.props.battle?.stats.spyResults).not.toHaveProperty(
      'successProbability',
    );
    expect(result.props.battle?.stats.spyResults).not.toHaveProperty(
      'spyLosses',
    );
    expect(result.props.battle).not.toHaveProperty('acl');
    expect(request.res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
  });
  it('keeps the attacker’s personal report even when it is public', async () => {
    acl = [{ is_public: true }];
    session = { user: { id: 11 } };
    const result = await getServerSideProps(context());
    expect(result.props.battle?.stats.spyResults).toHaveProperty(
      'successProbability',
      0.75,
    );
  });
  it('rejects invalid IDs before querying and hides old-era public reports', async () => {
    expect(
      (await getServerSideProps(context('not-an-id'))).props.battle,
    ).toBeNull();
    expect(mockPrisma.attack_log.findUnique).not.toHaveBeenCalled();
    acl = [{ is_public: true }];
    mockPrisma.era.findFirst.mockResolvedValue({
      startDate: new Date('2026-10-20'),
    });
    expect((await getServerSideProps(context())).props.battle).toBeNull();
  });
});
