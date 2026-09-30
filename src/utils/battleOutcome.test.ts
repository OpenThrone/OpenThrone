import { beforeEach, describe, expect, it } from 'bun:test';
import { mtRandImpl } from 'test/utils/mockMtRand';

import { Fortifications, levelXPArray } from '@/constants';
import UserModel from '@/models/Users';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { executeAttack } from '@/utils/attackFunctions';
import { createSeededRandom } from '@/utils/random';

// Other test files in this process install a global mtRand mock whose fn
// ignores the caller-provided random. Restore pass-through semantics so the
// seeded battles below are deterministic regardless of execution order.
beforeEach(() => {
  mtRandImpl.fn = ((min = 0, max = 1, random?: () => number) =>
    (random ?? Math.random)() * (max - min) + min) as any;
});

/** Builds a UserModel with exact level/race and a unit roster. */
function buildUser(opts: {
  race: string;
  level: number;
  fortLevel: number;
  fortHpOverride?: number;
  gold: bigint;
  units: Array<[string, number, number]>;
}): UserModel {
  const g = new MockUserGenerator();
  g.setLevel(opts.level)
    .setFortLevel(opts.fortLevel)
    .setFortHitpoints(
      opts.fortHpOverride ??
        Fortifications.find((f) => f.level === opts.fortLevel)?.hitpoints ??
        500,
    )
    .adjustGold(opts.gold - 25000n)
    .clearUnits()
    .clearItems()
    .clearBattleUpgrades();
  g.addUnits(
    opts.units.map(([type, level, quantity], i) => ({
      id: i,
      userId: 1,
      type,
      level,
      quantity,
      isMercenary: false,
    })) as any,
  );
  const raw = g.getUser() as any;
  raw.race = opts.race;
  raw.class = 'FIGHTER';
  raw.experience = levelXPArray.find((l) => l.level === opts.level)?.xp ?? 0;
  return new UserModel(raw);
}

const PEER = {
  level: 20,
  fortLevel: 6,
  gold: 5_000_000n,
  units: [
    ['OFFENSE', 1, 1000] as [string, number, number],
    ['DEFENSE', 1, 800] as [string, number, number],
    ['CITIZEN', 1, 1600] as [string, number, number],
    ['WORKER', 1, 900] as [string, number, number],
  ],
};

function peer(side: 'attacker' | 'defender', fortHpOverride?: number): UserModel {
  return buildUser({
    ...PEER,
    race: side === 'attacker' ? 'HUMAN' : 'UNDEAD',
    fortHpOverride,
  });
}

describe('canonical outcome', () => {
  it('declares exactly one outcome, consistent between result and canonical data', async () => {
    const result = await executeAttack(
      peer('attacker') as any,
      peer('defender') as any,
      10,
      false,
      { random: createSeededRandom('canonical-peer') },
    );

    // Peer assaults are genuinely contested; what must hold on every seed is
    // that the declared result and the canonical outcome agree.
    const canonical = (result as any).canonicalOutcome;
    expect(['WIN', 'LOSS']).toContain(result.result);
    expect(canonical.winner).toBe(result.result === 'WIN' ? 'ATTACKER' : 'DEFENDER');
    expect([
      'DEFENSE_WIPED',
      'FORT_BREACHED',
      'PROFITABLE_RAID',
      'DEFENDER_HELD',
    ]).toContain(canonical.reason);
    expect(canonical.attackerValueLost).toBeGreaterThanOrEqual(0);
    expect(canonical.defenderValueLost).toBeGreaterThanOrEqual(0);
    expect(canonical.fortValueDamage).toBeGreaterThanOrEqual(0);
    expect(canonical.defenseUnitsBroken).toBeGreaterThanOrEqual(0);
    expect(canonical.dentRequiredUnits).toBeGreaterThanOrEqual(0);
  });

  it('a probe raid that carries gold home without losses is a win for the raider', async () => {
    const result = await executeAttack(
      peer('attacker') as any,
      peer('defender') as any,
      1,
      false,
      { random: createSeededRandom('canonical-poke') },
    );

    expect(result.result).toBe('WIN');
    expect((result as any).canonicalOutcome.reason).toBe('PROFITABLE_RAID');
    expect(result.pillagedGold).toBeGreaterThan(0);
    expect(result.Losses.Attacker.total).toBe(0);
  });

  it('wiping an undefended target is an objective win', async () => {
    const attacker = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [['OFFENSE', 1, 1000]],
    });
    const naked = buildUser({
      race: 'UNDEAD',
      level: 20,
      fortLevel: 3,
      gold: 5_000_000n,
      units: [['WORKER', 1, 2000]],
    });

    const result = await executeAttack(attacker as any, naked as any, 10, false, {
      random: createSeededRandom('canonical-naked'),
    });

    expect(result.result).toBe('WIN');
    expect((result as any).canonicalOutcome.reason).toBe('DEFENSE_WIPED');
  });

  it('an overwhelming raid on a weakly defended rich target wins', async () => {
    const attacker = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [['OFFENSE', 1, 5000]],
    });
    const weakRich = buildUser({
      race: 'UNDEAD',
      level: 20,
      fortLevel: 6,
      gold: 50_000_000n,
      units: [
        ['DEFENSE', 1, 300],
        ['CITIZEN', 1, 4000],
        ['WORKER', 1, 2000],
      ],
    });

    const result = await executeAttack(attacker as any, weakRich as any, 10, false, {
      random: createSeededRandom('canonical-goliath'),
    });

    expect(result.result).toBe('WIN');
    expect(result.pillagedGold).toBeGreaterThan(0);
  });

  it('XP always agrees with the canonical winner', async () => {
    // Deterministic loss: a knight blob ground down by an archer garrison and
    // walls trades far more value than it destroys or carries off.
    const siegeAttacker = buildUser({
      race: 'HUMAN',
      level: 25,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [['OFFENSE', 2, 10000]],
    });
    const fortress = buildUser({
      race: 'UNDEAD',
      level: 20,
      fortLevel: 12,
      gold: 100_000n, // banked treasury: almost nothing on hand to raid
      units: [
        ['DEFENSE', 2, 4000],
        ['DEFENSE', 1, 1000],
        ['WORKER', 1, 5000],
        ['OFFENSE', 2, 5000],
      ],
    });
    const loss = await executeAttack(
      siegeAttacker as any,
      fortress as any,
      10,
      false,
      { random: createSeededRandom('xp-loss') },
    );
    expect(loss.result).toBe('LOSS');
    expect(loss.experienceGained.defender).toBeGreaterThan(
      loss.experienceGained.attacker,
    );

    const attacker = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [['OFFENSE', 1, 5000]],
    });
    const weakRich = buildUser({
      race: 'UNDEAD',
      level: 20,
      fortLevel: 3,
      gold: 50_000_000n,
      units: [['DEFENSE', 1, 50], ['WORKER', 1, 1000]],
    });
    const win = await executeAttack(attacker as any, weakRich as any, 10, false, {
      random: createSeededRandom('xp-win'),
    });
    expect(win.result).toBe('WIN');
    expect(win.experienceGained.attacker).toBeGreaterThan(
      win.experienceGained.defender,
    );
  });
});

describe('fort-shielded treasury', () => {
  const goliath = () =>
    buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [['OFFENSE', 1, 5000]],
    });
  // Fort 10 (2,500 HP): strong enough that a 5,000-soldier assault cannot
  // breach it even with overkill scaling — the loot cap stays at the floor.
  const hardTarget = (fortHpOverride?: number) =>
    buildUser({
      race: 'UNDEAD',
      level: 20,
      fortLevel: 10,
      fortHpOverride,
      gold: 50_000_000n,
      units: [
        ['DEFENSE', 1, 300],
        ['CITIZEN', 1, 4000],
        ['WORKER', 1, 2000],
      ],
    });

  it('a breached fort yields far more loot than a standing one', async () => {
    const standing = await executeAttack(
      goliath() as any,
      hardTarget() as any,
      10,
      false,
      { random: createSeededRandom('loot-standing') },
    );
    const breached = await executeAttack(
      goliath() as any,
      hardTarget(0) as any,
      10,
      false,
      { random: createSeededRandom('loot-breached') },
    );

    expect(standing.result).toBe('WIN');
    expect(breached.result).toBe('WIN');
    expect((breached as any).canonicalOutcome.reason).toBe('FORT_BREACHED');
    expect(breached.pillagedGold).toBeGreaterThan(standing.pillagedGold * 2n);
  });

  it('the daily dogpile gold allowance caps what leaves the treasury', async () => {
    const result = await executeAttack(
      goliath() as any,
      hardTarget(0) as any,
      10,
      false,
      {
        random: createSeededRandom('loot-allowance'),
        defenderDailyGoldRemaining: 1000n,
      },
    );

    expect(result.result).toBe('WIN');
    expect(result.pillagedGold).toBeLessThanOrEqual(1000n);
  });
});
