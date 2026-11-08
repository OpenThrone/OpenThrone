import { describe, expect, it, mock } from 'bun:test';

import UserModel from '@/models/Users';
import { mercenaryOffer } from '@/services/Mercenary.service';
import { recomputeStoredStatsInTx } from '@/utils/adminRecomputeStats';

const baseUser = {
  id: 7,
  experience: 0,
  fort_level: 1,
  fort_hitpoints: 50,
  race: 'HUMAN',
  class: 'FIGHTER',
  currentEraId: 2,
  UserItem: [],
  UserStructureUpgrade: [],
  UserBattleUpgrade: [],
  UserBonusPoints: [],
};

const contract = (overrides: Record<string, unknown> = {}) => ({
  id: 11,
  userId: 7,
  type: 'OFFENSE',
  level: 1,
  kind: 'MERCENARY',
  status: 'ACTIVE',
  eraId: 2,
  survivingQuantity: 100,
  equipment: mercenaryOffer('OFFENSE', 1).equipment,
  startsAt: new Date(Date.now() - 60_000),
  expiresAt: new Date(Date.now() + 3_600_000),
  ...overrides,
});

const run = async (user: Record<string, unknown>) => {
  const update = mock(async () => null);
  const tx = {
    users: { findUnique: mock(async () => user), update },
  } as any;
  const result = await recomputeStoredStatsInTx(tx, 7);
  return { result, update };
};

describe('recomputeStoredStatsInTx', () => {
  it('persists all strength columns', async () => {
    const { result, update } = await run({
      ...baseUser,
      UserUnit: [{ type: 'OFFENSE', level: 1, quantity: 10 }],
      forceContracts: [],
      wounded_units: [],
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        killing_str: result.killingStrength,
        defense_str: result.defenseStrength,
        offense: result.offense,
        defense: result.defense,
        spy: result.spy,
        sentry: result.sentry,
      },
    });
    expect(result.offense).toBeGreaterThan(0);
  });

  it('counts current-era contract troops minus wounds, ignoring other eras', async () => {
    const owned = await run({
      ...baseUser,
      UserUnit: [],
      forceContracts: [],
      wounded_units: [],
    });
    const withContract = await run({
      ...baseUser,
      UserUnit: [],
      forceContracts: [contract(), contract({ id: 12, eraId: 1 })],
      wounded_units: [],
    });
    const wounded = await run({
      ...baseUser,
      UserUnit: [],
      forceContracts: [contract()],
      wounded_units: [{ forceContractId: 11, quantity: 100 }],
    });
    const otherEraOnly = await run({
      ...baseUser,
      UserUnit: [],
      forceContracts: [contract({ id: 12, eraId: 1 })],
      wounded_units: [],
    });
    expect(withContract.result.offense).toBeGreaterThan(owned.result.offense);
    expect(wounded.result.offense).toBe(owned.result.offense);
    expect(otherEraOnly.result.offense).toBe(owned.result.offense);
  });

  it('stores the same four stats the turn cron writes, spy and sentry included', async () => {
    const user = {
      ...baseUser,
      UserUnit: [
        { type: 'OFFENSE', level: 1, quantity: 10 },
        { type: 'DEFENSE', level: 1, quantity: 10 },
        { type: 'SPY', level: 1, quantity: 10 },
        { type: 'SENTRY', level: 1, quantity: 10 },
      ],
      forceContracts: [],
      wounded_units: [],
    };
    const { result } = await run(user);
    // The turn cron writes these UserModel values (CronJob.updateUserPerTurn).
    const turn = new UserModel(user as any);
    turn.updateStats();
    expect(result.spy).toBeGreaterThan(0);
    expect(result.sentry).toBeGreaterThan(0);
    expect({
      offense: result.offense,
      defense: result.defense,
      spy: result.spy,
      sentry: result.sentry,
    }).toEqual({
      offense: turn.offense,
      defense: turn.defense,
      spy: turn.spy,
      sentry: turn.sentry,
    });
  });
});
