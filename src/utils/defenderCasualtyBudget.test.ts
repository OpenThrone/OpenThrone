import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockMtRand, mtRandImpl } from 'test/utils/mockMtRand';

import { Fortifications } from '@/constants';

installMockMtRand(vi);
const { executeAttack } = require('./attackFunctions');
const { COMBAT_RULESETS } = require('./balance/combatRulesets');
const { createSeededRandom } = require('./random');

beforeEach(() => {
  mtRandImpl.fn = () => 0.5;
});

const SLOTS = ['WEAPON', 'HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD'];

/** One side of the #303 shape: a level-3 walled town with level-1 troops. */
const makeSide = (
  id: number,
  roster: {
    offense?: number;
    offenseSets?: number;
    defense?: number;
    defenseSets?: number;
    workers?: number;
  },
) => {
  const units = (
    [
      ['OFFENSE', roster.offense ?? 0],
      ['DEFENSE', roster.defense ?? 0],
      ['WORKER', roster.workers ?? 0],
    ] as const
  )
    .filter(([, quantity]) => quantity > 0)
    .map(([type, quantity], i) => ({
      id: id * 100 + i,
      userId: id,
      type,
      level: 1,
      quantity,
      isMercenary: false,
    }));
  const sets = (usage: 'OFFENSE' | 'DEFENSE', quantity: number) =>
    quantity > 0
      ? SLOTS.map((type) => ({ usage, type, level: 1, quantity }))
      : [];
  return {
    id,
    userId: id,
    displayName: `side-${id}`,
    level: 3,
    race: 'HUMAN',
    class: 'FIGHTER',
    houseLevel: 1,
    fortLevel: 1,
    fortHitpoints: Fortifications.find((f) => f.level === 1)!.hitpoints,
    gold: 2_000_000n,
    units,
    mercenaries: [],
    items: [
      ...sets('OFFENSE', roster.offenseSets ?? 0),
      ...sets('DEFENSE', roster.defenseSets ?? 0),
    ],
    structure_upgrades: [{ type: 'ARMORY', level: 1 }],
    battle_upgrades: [],
    bonus_points: [],
  };
};

/**
 * The issue #303 matchup: 1,155 fully equipped soldiers assault 770 fully
 * equipped guards behind an intact fort, with the defender's idle worker
 * count as the only variable.
 */
const fight = async (workers: number, version: string) => {
  const result: any = await executeAttack(
    makeSide(1, { offense: 1_155, offenseSets: 1_155 }) as any,
    makeSide(2, { defense: 770, defenseSets: 770, workers }) as any,
    10,
    false,
    {
      random: createSeededRandom('defender-budget-303'),
      ruleset: COMBAT_RULESETS[version],
    },
  );
  const wounded = (side: 'attacker' | 'defender') =>
    (result.wounded?.[side] ?? []).reduce(
      (sum: number, row: { quantity: number }) => sum + row.quantity,
      0,
    );
  const lostUnits = (type: string) =>
    (result.Losses.Defender.units ?? [])
      .filter((row: { type?: string }) => row.type === type)
      .reduce(
        (sum: number, row: { quantity: number }) => sum + row.quantity,
        0,
      );
  return {
    result: result.result as string,
    defLost: result.Losses.Defender.total + wounded('defender'),
    attLost: result.Losses.Attacker.total + wounded('attacker'),
    defWorkersLost: lostUnits('WORKER'),
  };
};

describe('defender casualty budget on engaged military (combat-v13)', () => {
  it('combat-v13: worker count no longer changes guard losses', async () => {
    const none = await fight(0, 'combat-v13');
    const recorded = await fight(1_271, 'combat-v13');
    const lots = await fight(5_000, 'combat-v13');
    expect(none.result).toBe('WIN');
    expect(none.defLost).toBeGreaterThan(0);
    expect(recorded.defLost).toBe(none.defLost);
    expect(lots.defLost).toBe(none.defLost);
    // Only the garrison is at risk while the fort holds.
    expect(lots.defWorkersLost).toBe(0);
  });

  it('combat-v12: worker count still grows guard losses (#303 as filed)', async () => {
    const none = await fight(0, 'combat-v12');
    const lots = await fight(5_000, 'combat-v12');
    expect(none.result).toBe('WIN');
    expect(none.defLost).toBeGreaterThan(0);
    expect(lots.defLost).toBeGreaterThan(none.defLost);
  });

  it('combat-v13 budgets exactly like combat-v12 when only the garrison is at risk', async () => {
    // With no civilians the whole population is the engaged military, so
    // both rulesets anchor the defender's budget to the same 770 guards.
    const v12 = await fight(0, 'combat-v12');
    const v13 = await fight(0, 'combat-v13');
    expect(v13.defLost).toBe(v12.defLost);
    expect(v13.attLost).toBe(v12.attLost);
  });
});

/**
 * A garrison-less town: civilians only, behind a level-1 fort. Returns the
 * battle's mitigation log so the test can see, turn by turn, whether
 * civilians were fighting while the walls still stood.
 */
const raidCivilians = async (
  version: string,
  turns: number,
  fortHitpoints?: number,
) => {
  const defender = makeSide(2, { workers: 3_000 });
  if (fortHitpoints !== undefined) defender.fortHitpoints = fortHitpoints;
  const result: any = await executeAttack(
    makeSide(1, { offense: 400, offenseSets: 400 }) as any,
    defender as any,
    turns,
    false,
    {
      random: createSeededRandom('civilians-303'),
      ruleset: COMBAT_RULESETS[version],
    },
  );
  return {
    log: result.mitigationLog as Array<{
      fortHpStart: number;
      includeCitz: boolean;
    }>,
    workersLost: (result.Losses.Defender.units ?? [])
      .filter((row: { type?: string }) => row.type === 'WORKER')
      .reduce(
        (sum: number, row: { quantity: number }) => sum + row.quantity,
        0,
      ),
    attackerLost: result.Losses.Attacker.total as number,
  };
};

describe('civilians join the defense when the fort falls (combat-v13)', () => {
  it('combat-v13: civilians neither fight nor count while the fort stands', async () => {
    // There are no guards, but the fort (50 HP) outlasts one battle.
    const { log, workersLost, attackerLost } = await raidCivilians(
      'combat-v13',
      10,
    );
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((entry) => !entry.includeCitz)).toBe(true);
    expect(workersLost).toBe(0);
    // Nobody fights back behind the walls, so the raiders lose nothing.
    expect(attackerLost).toBe(0);
  });

  it('combat-v13: civilians fight, can fall and count once the fort is down', async () => {
    const { log, workersLost } = await raidCivilians('combat-v13', 10, 0);
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((entry) => entry.includeCitz)).toBe(true);
    expect(workersLost).toBeGreaterThan(0);
  });

  it('combat-v12: civilians fight behind standing walls once the guards are gone', async () => {
    const { log, attackerLost } = await raidCivilians('combat-v12', 10);
    expect(
      log.some((entry) => entry.includeCitz && entry.fortHpStart > 0),
    ).toBe(true);
    expect(attackerLost).toBeGreaterThan(0);
  });
});
