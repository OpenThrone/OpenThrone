import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { getAttackRecommendation } =
  await import('@/services/AttackRecommendation.service');
const report = (overrides = {}) => ({
  id: 50,
  type: 'INTELLIGENCE',
  timestamp: new Date(),
  attacker_id: 3,
  defender_id: 2,
  winner: 3,
  acl: [],
  stats: {
    spyResults: {
      success: true,
      intelPercentage: 80,
      intelligenceGathered: { defense: 10, gold: 'secret-gold' },
    },
    replay: { secret: true },
  },
  ...overrides,
});
let member = false;
beforeEach(() => {
  member = false;
  mockPrisma.era.findFirst.mockResolvedValue({
    id: 1,
    startDate: new Date(Date.now() - 86400000),
  });
  mockPrisma.users.findUnique.mockResolvedValue({
    id: 1,
    fort_level: 1,
    race: 'HUMAN',
    class: 'FIGHTER',
    experience: 0,
    UserUnit: [
      {
        id: 1,
        userId: 1,
        type: 'OFFENSE',
        level: 1,
        quantity: 100,
        isMercenary: false,
      },
    ],
    UserItem: [],
    UserBattleUpgrade: [],
    UserStructureUpgrade: [],
    UserBonusPoints: [],
  });
  mockPrisma.alliance_memberships = {
    findMany: vi.fn(async () => (member ? [{ alliance_id: 7 }] : [])),
    findFirst: vi.fn(async () => (member ? { alliance_id: 7 } : null)),
  };
  // Return even unreadable rows to prove the service rechecks before extraction.
  mockPrisma.attack_log.findMany = vi.fn(async () => [report()]);
});
describe('recommendation report visibility', () => {
  it('excludes unreadable reports even when the query returns them', async () => {
    expect((await getAttackRecommendation(1, 2)).evidence).toEqual([]);
    const query = mockPrisma.attack_log.findMany.mock.calls[0][0];
    expect(JSON.stringify(query.where)).toContain('shared_with_user_id');
    expect(query.where.timestamp.gte).toBeInstanceOf(Date);
  });
  it('includes direct shares using only redacted evidence', async () => {
    mockPrisma.attack_log.findMany.mockResolvedValue([
      report({
        acl: [{ shared_with_user_id: 1, shared_with_alliance_id: null }],
      }),
    ]);
    const result = await getAttackRecommendation(1, 2);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].defense).toBe(10);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('gold');
  });
  it('counts observed defensive units like the intel report ring', async () => {
    const shared = {
      acl: [{ shared_with_user_id: 1, shared_with_alliance_id: null }],
    };
    mockPrisma.attack_log.findMany.mockResolvedValue([
      report({
        ...shared,
        stats: {
          spyResults: {
            success: true,
            intelPercentage: 100,
            intelligenceGathered: {
              defense: 2968,
              units: [
                { type: 'DEFENSE', level: 1, quantity: 150 },
                { type: 'OFFENSE', level: 1, quantity: 40 },
              ],
              mercenaries: [{ type: 'DEFENSE', level: 1, quantity: 43 }],
            },
          },
        },
      }),
      report({ id: 49, ...shared }),
    ]);
    const { evidence } = await getAttackRecommendation(1, 2);
    const byId = (id: number) => evidence.find((row) => row.id === id);
    expect(byId(50)).toMatchObject({ defense: 2968, defenseUnits: 193 });
    expect(byId(49)?.defenseUnits).toBeNull();
  });
  it('revokes alliance evidence immediately after leaving', async () => {
    mockPrisma.attack_log.findMany.mockResolvedValue([
      report({
        acl: [{ shared_with_user_id: null, shared_with_alliance_id: 7 }],
      }),
    ]);
    member = true;
    expect((await getAttackRecommendation(1, 2)).evidence).toHaveLength(1);
    member = false;
    expect((await getAttackRecommendation(1, 2)).evidence).toHaveLength(0);
  });
  it('queries only evidence-shaped rows and reuses loaded memberships', async () => {
    member = true;
    mockPrisma.attack_log.findMany.mockResolvedValue([
      report({
        acl: [{ shared_with_user_id: null, shared_with_alliance_id: 7 }],
      }),
      report({
        id: 52,
        acl: [{ shared_with_user_id: null, shared_with_alliance_id: 7 }],
      }),
    ]);
    expect((await getAttackRecommendation(1, 2)).evidence).toHaveLength(2);
    expect(mockPrisma.alliance_memberships.findFirst).not.toHaveBeenCalled();
    const [, scope] = mockPrisma.attack_log.findMany.mock.calls[0][0].where.AND;
    expect(scope).toEqual({
      OR: [
        { type: 'attack', attacker_id: 1, defender_id: 2 },
        { type: { not: 'attack' }, defender_id: 2 },
      ],
    });
  });
  it('does not confuse the target as attacker or shared battles with personal wins', async () => {
    mockPrisma.attack_log.findMany.mockResolvedValue([
      report({ attacker_id: 2, defender_id: 1 }),
      report({
        type: 'attack',
        acl: [{ shared_with_user_id: 1, shared_with_alliance_id: null }],
      }),
      report({ id: 51, type: 'attack', attacker_id: 1, winner: 1 }),
    ]);
    const result = await getAttackRecommendation(1, 2);
    expect(result.evidence.map((row) => row.id)).toEqual([51]);
    expect(result.verdict).toBe('limited');
  });
  it('does not treat absent spy defense as zero', async () => {
    mockPrisma.attack_log.findMany.mockResolvedValue([
      report({
        attacker_id: 1,
        stats: {
          spyResults: {
            success: true,
            intelligenceGathered: { defense: null },
          },
        },
      }),
    ]);
    expect((await getAttackRecommendation(1, 2)).verdict).toBe('insufficient');
  });
});

it('uses public presence only and promotes a convincing real redacted battle', async () => {
  const viewer = await mockPrisma.users.findUnique();
  mockPrisma.users.findUnique.mockImplementation(async ({ where, select }) => {
    if (where.id === 2) {
      expect(select).toEqual({ last_active: true });
      return { last_active: new Date(Date.now() - 1000) };
    }
    return viewer;
  });
  mockPrisma.attack_log.findMany.mockResolvedValue([
    report({
      type: 'attack',
      attacker_id: 1,
      winner: 1,
      stats: {
        startOfAttack: {
          Attacker: { units: [{ type: 'OFFENSE', level: 1, quantity: 100 }] },
        },
        attacker_losses: JSON.stringify({ total: 1 }),
        defender_losses: JSON.stringify({ total: 10 }),
        wounded: JSON.stringify({ attacker: [], defender: [] }),
        turns: 10,
        mitigation_log: JSON.stringify([
          { source: 'ATTACKER', mitigatedDamage: 100 },
          { source: 'DEFENDER', mitigatedDamage: 10 },
        ]),
        replay: { secret: 'never-use-hidden-defender-stats' },
      },
    }),
  ]);
  const result = await getAttackRecommendation(1, 2);
  expect(result.verdict).toBe('favorable');
  expect(result.activity).toBe('online');
  expect(result.evidence[0].quality).toBe('decisive');
  expect(JSON.stringify(result)).not.toContain('secret');
});
