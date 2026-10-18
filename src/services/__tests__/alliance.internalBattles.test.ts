import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the service loads.
const { AllianceInternalBattlesService, INTERNAL_BATTLES_PAGE_SIZE } =
  await import('../AllianceInternalBattles.service');

const ALLIANCE_ID = 3;
const ERA_START = new Date('2026-10-01T00:00:00Z');
let memberIds: number[];

beforeEach(() => {
  memberIds = [5, 6, 8];
  mockPrisma.alliance_memberships = {
    findMany: vi.fn(async () => memberIds.map((user_id) => ({ user_id }))),
  };
  mockPrisma.era.findFirst = vi.fn(async () => ({ startDate: ERA_START }));
  mockPrisma.attack_log.count = vi.fn(async () => 41);
  mockPrisma.attack_log.findMany = vi.fn(async () => [
    {
      id: 77,
      timestamp: new Date('2026-10-10T00:00:00Z'),
      winner: 6,
      pillaged_gold: 1234n,
      attackerPlayer: { id: 5, display_name: 'Five' },
      defenderPlayer: { id: 6, display_name: 'Six' },
    },
  ]);
});

describe('alliance internal battles', () => {
  it('refuses non-members', async () => {
    await expect(
      AllianceInternalBattlesService.list(99, { allianceId: ALLIANCE_ID }),
    ).rejects.toThrow(/not a member/);
    expect(mockPrisma.attack_log.findMany).not.toHaveBeenCalled();
  });

  it('lists member-on-member attacks this era, 20 per page', async () => {
    const result = await AllianceInternalBattlesService.list(5, {
      allianceId: ALLIANCE_ID,
      page: 2,
    });
    const args = mockPrisma.attack_log.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      type: 'attack',
      attacker_id: { in: memberIds },
      defender_id: { in: memberIds },
      timestamp: { gte: ERA_START },
    });
    expect(args.skip).toBe(INTERNAL_BATTLES_PAGE_SIZE);
    expect(args.take).toBe(20);
    expect(result.total).toBe(41);
    expect(result.items).toEqual([
      {
        id: 77,
        timestamp: new Date('2026-10-10T00:00:00Z'),
        attacker: { id: 5, display_name: 'Five' },
        defender: { id: 6, display_name: 'Six' },
        winner: 6,
        pillaged_gold: '1234',
      },
    ]);
  });

  it('returns nothing for a lone member without querying attacks', async () => {
    memberIds = [5];
    const result = await AllianceInternalBattlesService.list(5, {
      allianceId: ALLIANCE_ID,
    });
    expect(result.items).toEqual([]);
    expect(mockPrisma.attack_log.findMany).not.toHaveBeenCalled();
  });
});
