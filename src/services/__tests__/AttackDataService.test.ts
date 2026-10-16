import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);

const {
  getTop10AttacksByTotalCasualties,
  getTop10TotalAttackerCasualties,
  getTop10TotalDefenderCasualties,
} = require('../AttackDataService');
const {
  resolveAttackerLosses,
  resolveDefenderLosses,
} = require('../UserEraStats.service');

const ERA_START = new Date(Date.now() - 3 * 86400000);

describe('community activity leaderboards', () => {
  beforeEach(() => {
    resetMockPrisma();
    mockPrisma.era.findFirst.mockResolvedValue({
      id: 2,
      name: 'Test era',
      startDate: ERA_START,
    });
    mockPrisma.recruit_history = { findMany: vi.fn().mockResolvedValue([]) };
    mockPrisma.attack_log.findMany = vi.fn().mockResolvedValue([]);
  });

  it('uses persisted casualty totals, including a genuine zero', () => {
    expect(
      resolveAttackerLosses({
        attacker_losses_total: 12,
        stats: { attacker_losses: JSON.stringify({ total: 3 }) },
      }),
    ).toBe(12);
    expect(
      resolveDefenderLosses({
        defender_losses_total: 0,
        stats: { defender_losses: { total: 8 } },
      }),
    ).toBe(0);
  });

  it('reads legacy object and string losses without failing on damaged JSON', () => {
    expect(
      resolveAttackerLosses({ stats: { attacker_losses: { total: 4 } } }),
    ).toBe(4);
    expect(
      resolveDefenderLosses({ stats: { defender_losses: '{"total":7}' } }),
    ).toBe(7);
    expect(resolveAttackerLosses({ stats: { attacker_losses: '{bad' } })).toBe(
      0,
    );
    expect(resolveDefenderLosses({ stats: null })).toBe(0);
  });

  it('totals both sides and retains profile IDs for casualty rankings', async () => {
    mockPrisma.attack_log.findMany.mockResolvedValue([
      {
        attacker_id: 10,
        defender_id: 20,
        attackerPlayer: { display_name: 'Attacker' },
        defenderPlayer: { display_name: 'Defender' },
        attacker_losses_total: 6,
        defender_losses_total: 9,
        stats: {
          attacker_losses: '{"total":1}',
          defender_losses: '{"total":2}',
        },
      },
      {
        attacker_id: 10,
        defender_id: 20,
        attackerPlayer: { display_name: 'Attacker' },
        defenderPlayer: { display_name: 'Defender' },
        attacker_losses_total: null,
        defender_losses_total: null,
        stats: {
          attacker_losses: '{"total":4}',
          defender_losses: { total: 3 },
        },
      },
    ]);
    expect(await getTop10TotalAttackerCasualties(7 * 86400000)).toEqual([
      { id: 10, rank: 1, display_name: 'Attacker', stat: 10 },
    ]);
    expect(await getTop10TotalDefenderCasualties(7 * 86400000)).toEqual([
      { id: 20, rank: 1, display_name: 'Defender', stat: 12 },
    ]);
    expect(
      (await getTop10AttacksByTotalCasualties(7 * 86400000)).map(
        (row: { stat: number }) => row.stat,
      ),
    ).toEqual([15, 7]);
  });
});
