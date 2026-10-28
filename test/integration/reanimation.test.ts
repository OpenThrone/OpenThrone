/**
 * Integration coverage for Undead reanimation (#211, phase 5 of #205): the
 * own and enemy pools on a resolved attack, fort-level scaling, the level-1
 * result, whole-battle rounding against stack-splitting, the daily cap
 * across battles and its OT-day reset, the exclusions (other races, locked
 * forts, protected and vacationing defenders, captured units), Undead vs
 * Undead both rising from one battle, report redaction, and concurrent
 * attacks on one Undead defender never exceeding the cap.
 */
import { beforeEach, describe, expect, test } from 'bun:test';

import {
  enemyReanimationPercent,
  ownReanimationPercent,
  REANIMATION_FORT_LEVEL,
  reanimationDailyCap,
} from '@/constants/Reanimation';
import prisma from '@/lib/prisma';
import { BattleUser } from '@/models/BattleUser';
import { getUserById } from '@/services/AttackDataService';
import { redactAttackLogForViewer } from '@/services/AttackLogAccess.service';
import { AttackService } from '@/services/AttackService';
import { startNewEra } from '@/services/Era.service';
import {
  reanimatedUnitsTotal,
  type ReanimationBattleOutcome,
  ReanimationService,
} from '@/services/Reanimation.service';
import { createUser } from '@/services/User.service';
import { getOTDayKey } from '@/utils/timefunctions';

import { resetDatabase, setRuntimeSwitch, setShowDungeon } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Level 10 (80k XP) ends new-player protection by the LEVEL rule. */
const UNPROTECTED_XP = 80_000;
/** The fort level that unlocks reanimation (an Outpost Level 2). */
const REANIMATION_FORT = REANIMATION_FORT_LEVEL;
/** The fort level that also unlocks the dungeon, for the capture overlap. */
const DUNGEON_FORT = 13;

const COMBAT_TYPES = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] as const;

const createPlayer = (name: string, race = 'HUMAN') =>
  createUser(
    `${name.toLowerCase().replace(/\s+/g, '-')}@example.test`,
    'not-a-real-hash',
    name,
    race,
    'FIGHTER',
  );

const setUnits = async (
  userId: number,
  type: 'OFFENSE' | 'DEFENSE' | 'SPY' | 'SENTRY' | 'CITIZEN',
  quantity: number,
  level = 1,
) => {
  await prisma.userUnit.upsert({
    where: {
      userId_type_level_isMercenary: {
        userId,
        type,
        level,
        isMercenary: false,
      },
    },
    create: { userId, type, level, quantity, isMercenary: false },
    update: { quantity },
  });
};

const unitQuantity = async (userId: number, type: string, level?: number) => {
  const rows = await prisma.userUnit.findMany({
    where: {
      userId,
      type,
      isMercenary: false,
      ...(level !== undefined ? { level } : {}),
    },
  });
  return rows.reduce((sum, row) => sum + row.quantity, 0);
};

const userRow = (userId: number) =>
  prisma.users.findUniqueOrThrow({ where: { id: userId } });

/** An era that started long enough ago that every player counts as a participant. */
const seedEra = () =>
  prisma.era.create({
    data: {
      name: 'Reanimation era',
      startDate: new Date(Date.now() - 20 * DAY_MS),
    },
  });

/** The combat units one side lost in a battle, from the log's losses JSON. */
const killedCombat = (
  log: { stats: unknown },
  side: 'attacker' | 'defender',
) => {
  const losses = JSON.parse(
    (log.stats as Record<string, string>)[`${side}_losses`],
  ) as {
    units: Array<{ type: string; quantity: number; isMercenary?: boolean }>;
  };
  return losses.units
    .filter(
      (unit) =>
        !unit.isMercenary &&
        (COMBAT_TYPES as readonly string[]).includes(unit.type) &&
        unit.quantity > 0,
    )
    .reduce((sum, unit) => sum + unit.quantity, 0);
};

/** The persisted post-battle roster a log records, per (type, level). */
const loggedUnits = (
  log: { stats: unknown },
  side: 'attacker' | 'defender',
): Record<string, number> => {
  const units = JSON.parse(
    (log.stats as Record<string, string>)[`${side}_units`],
  ) as Array<{ type: string; level: number; quantity: number }>;
  const totals: Record<string, number> = {};
  for (const unit of units) {
    const key = `${unit.type}:${unit.level}`;
    totals[key] = (totals[key] ?? 0) + unit.quantity;
  }
  return totals;
};

const reanimatedStat = (log: { stats: unknown }) => {
  const stat = (log.stats as Record<string, unknown>).reanimated_units as {
    attacker: number;
    defender: number;
  };
  expect(stat).toBeDefined();
  return stat;
};

/** Runs the battle hook exactly as the battle transaction does. */
const reanimate = (
  input: Parameters<typeof ReanimationService.reanimateFromBattle>[1],
) =>
  prisma.$transaction((tx) =>
    ReanimationService.reanimateFromBattle(tx, input),
  );

let eraId: number;

beforeEach(async () => {
  await resetDatabase();
  eraId = (await seedEra()).id;
});

describe('own and enemy pools on a resolved attack', () => {
  test('an Undead attacker raises 8% of its own fallen and 4% of the enemy dead', async () => {
    const attacker = await createPlayer('Grave caller', 'UNDEAD');
    const defender = await createPlayer('Pool loser');
    await prisma.users.update({
      where: { id: attacker.id },
      data: { experience: UNPROTECTED_XP, fort_level: REANIMATION_FORT },
    });
    await prisma.users.update({
      where: { id: defender.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(attacker.id, 'OFFENSE', 5000);
    await setUnits(defender.id, 'DEFENSE', 2000);
    await setUnits(defender.id, 'CITIZEN', 1000);

    const outcome = await AttackService.executeAttack(
      attacker.id,
      defender.id,
      10,
    );
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: defender.id },
    });

    const attackerKilled = killedCombat(log, 'attacker');
    const defenderKilled = killedCombat(log, 'defender');
    const ownPool = Math.floor(
      attackerKilled * ownReanimationPercent(REANIMATION_FORT),
    );
    const enemyPool = Math.floor(
      defenderKilled * enemyReanimationPercent(REANIMATION_FORT),
    );
    // A 5000-strong army caps the day at 100, well above both pools.
    const cap = reanimationDailyCap(5000);
    expect(cap).toBe(100);
    expect(ownPool).toBeGreaterThan(0);
    expect(enemyPool).toBeGreaterThan(0);
    expect(ownPool + enemyPool).toBeLessThanOrEqual(cap);
    const expected = ownPool + enemyPool;

    expect(reanimatedStat(log)).toEqual({ attacker: expected, defender: 0 });

    // The ledger was measured at this first battle of the OT day.
    const row = await userRow(attacker.id);
    expect(row.reanimated_today).toBe(expected);
    expect(row.reanimation_day).toBe(getOTDayKey());
    expect(row.reanimation_cap).toBe(cap);
    const defenderRow = await userRow(defender.id);
    expect(defenderRow.reanimation_day).toBeNull();

    // Every riser joined the roster as a level-1 stack of its own type: the
    // attacker's fallen were OFFENSE, the enemy dead DEFENSE.
    const logged = loggedUnits(log, 'attacker');
    expect(
      (await unitQuantity(attacker.id, 'OFFENSE', 1)) -
        (logged['OFFENSE:1'] ?? 0),
    ).toBe(ownPool);
    expect(
      (await unitQuantity(attacker.id, 'DEFENSE', 1)) -
        (logged['DEFENSE:1'] ?? 0),
    ).toBe(enemyPool);

    // The cached army stats include the risen units: each equals a fresh
    // recompute from the persisted post-battle roster, not a value computed
    // from the pre-grant survivors.
    const fresh = new BattleUser(await getUserById(attacker.id));
    expect(row.offense).toBe(
      fresh.getDetailedArmyStat('OFFENSE').totalStats.MeleeAtkPower,
    );
    expect(row.defense).toBe(
      fresh.getDetailedArmyStat('DEFENSE').totalStats.MeleeDefPower,
    );
    expect(row.spy).toBe(
      fresh.getDetailedArmyStat('SPY').totalStats.MeleeAtkPower,
    );
    expect(row.sentry).toBe(
      fresh.getDetailedArmyStat('SENTRY').totalStats.MeleeDefPower,
    );
  });

  test('an Undead defender raises its own fallen and the attacker dead', async () => {
    const attacker = await createPlayer('Defender-pool attacker');
    const defender = await createPlayer('Barrow warden', 'UNDEAD');
    await prisma.users.update({
      where: { id: attacker.id },
      data: { experience: UNPROTECTED_XP },
    });
    await prisma.users.update({
      where: { id: defender.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_level: REANIMATION_FORT,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(attacker.id, 'OFFENSE', 5000);
    await setUnits(defender.id, 'DEFENSE', 5000);
    await setUnits(defender.id, 'CITIZEN', 1000);

    const outcome = await AttackService.executeAttack(
      attacker.id,
      defender.id,
      10,
    );
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: defender.id },
    });

    const attackerKilled = killedCombat(log, 'attacker');
    const defenderKilled = killedCombat(log, 'defender');
    const ownPool = Math.floor(
      defenderKilled * ownReanimationPercent(REANIMATION_FORT),
    );
    const enemyPool = Math.floor(
      attackerKilled * enemyReanimationPercent(REANIMATION_FORT),
    );
    expect(ownPool).toBeGreaterThan(0);
    // Own fallen rise first; the enemy dead fill what is left of the cap.
    const cap = reanimationDailyCap(5000);
    const ownGrant = Math.min(ownPool, cap);
    const enemyGrant = Math.min(enemyPool, cap - ownGrant);
    const expected = ownGrant + enemyGrant;

    expect(reanimatedStat(log)).toEqual({ attacker: 0, defender: expected });

    const row = await userRow(defender.id);
    expect(row.reanimated_today).toBe(expected);
    expect(row.reanimation_cap).toBe(cap);

    const logged = loggedUnits(log, 'defender');
    expect(
      (await unitQuantity(defender.id, 'DEFENSE', 1)) -
        (logged['DEFENSE:1'] ?? 0),
    ).toBe(ownGrant);
    expect(
      (await unitQuantity(defender.id, 'OFFENSE', 1)) -
        (logged['OFFENSE:1'] ?? 0),
    ).toBe(enemyGrant);
  });
});

describe('fort scaling, level-1 result and eligibility rows', () => {
  const grantTotal = (
    outcome: ReanimationBattleOutcome,
    side: 'attacker' | 'defender',
  ) => reanimatedUnitsTotal(outcome[side]);

  test('both shares gain 0.5pp per fort level above 5, capped at 15% / 8%', async () => {
    const cases: Array<{
      fortLevel: number;
      ownFallen: number;
      enemyFallen: number;
      expected: number;
    }> = [
      { fortLevel: 5, ownFallen: 1000, enemyFallen: 1000, expected: 80 + 40 },
      { fortLevel: 10, ownFallen: 1000, enemyFallen: 1000, expected: 105 + 65 },
      { fortLevel: 13, ownFallen: 1000, enemyFallen: 1000, expected: 120 + 80 },
      { fortLevel: 19, ownFallen: 1000, enemyFallen: 1000, expected: 150 + 80 },
      { fortLevel: 30, ownFallen: 1000, enemyFallen: 1000, expected: 150 + 80 },
    ];
    let index = 0;
    for (const { fortLevel, ownFallen, enemyFallen, expected } of cases) {
      index += 1;
      const undead = await createPlayer(
        `Scaling necromancer ${index}`,
        'UNDEAD',
      );
      const human = await createPlayer(`Scaling victim ${index}`);
      // A big army keeps the daily cap out of the way.
      await setUnits(undead.id, 'OFFENSE', 100_000);
      const outcome = await reanimate({
        attacker: {
          userId: undead.id,
          fortLevel,
          economyLevel: 0,
          race: 'UNDEAD',
        },
        defender: {
          userId: human.id,
          fortLevel,
          economyLevel: 0,
          race: 'HUMAN',
        },
        attackerKilledUnits: [
          { type: 'OFFENSE', level: 2, quantity: ownFallen },
        ],
        defenderKilledUnits: [
          { type: 'DEFENSE', level: 3, quantity: enemyFallen },
        ],
        captivesTaken: 0,
      });
      expect(grantTotal(outcome, 'attacker')).toBe(expected);
      expect(grantTotal(outcome, 'defender')).toBe(0);
    }
  });

  test('risen units come back as level 1 of the same type, whatever tier they fell from', async () => {
    const undead = await createPlayer('Tiered necromancer', 'UNDEAD');
    const human = await createPlayer('Tiered victim');
    await setUnits(undead.id, 'OFFENSE', 10_000);
    const outcome = await reanimate({
      attacker: {
        userId: undead.id,
        fortLevel: REANIMATION_FORT,
        economyLevel: 0,
        race: 'UNDEAD',
      },
      defender: {
        userId: human.id,
        fortLevel: REANIMATION_FORT,
        economyLevel: 0,
        race: 'HUMAN',
      },
      attackerKilledUnits: [{ type: 'OFFENSE', level: 3, quantity: 500 }],
      defenderKilledUnits: [{ type: 'SENTRY', level: 2, quantity: 500 }],
      captivesTaken: 0,
    });
    // 8% of 500 = 40 own OFFENSE, 4% of 500 = 20 enemy SENTRY.
    expect(outcome.attacker).toEqual([
      { unitType: 'OFFENSE', quantity: 40 },
      { unitType: 'SENTRY', quantity: 20 },
    ]);
    const applied = await prisma.$transaction((tx) =>
      ReanimationService.applyReanimatedUnits(tx, undead.id, outcome.attacker),
    );
    expect(applied).toBe(60);
    expect(await unitQuantity(undead.id, 'OFFENSE', 1)).toBe(10_000 + 40);
    expect(await unitQuantity(undead.id, 'SENTRY', 1)).toBe(20);
    expect(await unitQuantity(undead.id, 'OFFENSE', 3)).toBe(0);
  });

  test('citizens, workers and mercenaries never rise', async () => {
    const undead = await createPlayer('Picky necromancer', 'UNDEAD');
    const human = await createPlayer('Civilian victim');
    const outcome = await reanimate({
      attacker: {
        userId: undead.id,
        fortLevel: REANIMATION_FORT,
        economyLevel: 0,
        race: 'UNDEAD',
      },
      defender: {
        userId: human.id,
        fortLevel: REANIMATION_FORT,
        economyLevel: 0,
        race: 'HUMAN',
      },
      attackerKilledUnits: [
        { type: 'CITIZEN', level: 1, quantity: 500 },
        { type: 'WORKER', level: 1, quantity: 500 },
        { type: 'OFFENSE', level: 1, quantity: 500, isMercenary: true },
      ],
      defenderKilledUnits: [
        { type: 'CITIZEN', level: 1, quantity: 500 },
        { type: 'DEFENSE', level: 1, quantity: 500, isMercenary: true },
      ],
      captivesTaken: 0,
    });
    expect(outcome.attacker).toEqual([]);
    expect(outcome.defender).toEqual([]);
    // The era's starting citizens are untouched: nothing untrained rose.
    expect(await unitQuantity(undead.id, 'CITIZEN', 1)).toBe(50);
    expect(await unitQuantity(undead.id, 'WORKER', 1)).toBe(0);
  });

  test('rounding happens once per pool, so splitting stacks cannot dodge or farm it', async () => {
    // 999 own fallen in one row: 79 rise.
    const one = await createPlayer('Rounding lich', 'UNDEAD');
    const victimOne = await createPlayer('Rounding victim one');
    await setUnits(one.id, 'OFFENSE', 100_000);
    const single = await reanimate({
      attacker: {
        userId: one.id,
        fortLevel: REANIMATION_FORT,
        economyLevel: 0,
        race: 'UNDEAD',
      },
      defender: {
        userId: victimOne.id,
        fortLevel: REANIMATION_FORT,
        economyLevel: 0,
        race: 'HUMAN',
      },
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 999 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
    });
    expect(reanimatedUnitsTotal(single.attacker)).toBe(79);

    // The same 999 split into 111 rows of 9: still 79.
    const many = await createPlayer('Split lich', 'UNDEAD');
    const victimMany = await createPlayer('Rounding victim many');
    await setUnits(many.id, 'OFFENSE', 100_000);
    const split = await reanimate({
      attacker: {
        userId: many.id,
        fortLevel: REANIMATION_FORT,
        economyLevel: 0,
        race: 'UNDEAD',
      },
      defender: {
        userId: victimMany.id,
        fortLevel: REANIMATION_FORT,
        economyLevel: 0,
        race: 'HUMAN',
      },
      attackerKilledUnits: Array.from({ length: 111 }, () => ({
        type: 'OFFENSE' as const,
        level: 1,
        quantity: 9,
      })),
      defenderKilledUnits: [],
      captivesTaken: 0,
    });
    expect(reanimatedUnitsTotal(split.attacker)).toBe(79);
  });
});

describe('the daily cap', () => {
  test('binds across several battles, loses the excess, and resets on the next OT day', async () => {
    // A dogpiled Undead defender: every battle raises 8% of its own fallen
    // plus 4% of each attacker's, and the ledger stops at 2% of the trained
    // combat army measured before the day's first battle (1000 -> 20).
    const attacker = await createPlayer('Dogpile thrower');
    const defender = await createPlayer('Dogpiled barrow', 'UNDEAD');
    await prisma.users.update({
      where: { id: attacker.id },
      data: { experience: UNPROTECTED_XP },
    });
    await prisma.users.update({
      where: { id: defender.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_level: REANIMATION_FORT,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(attacker.id, 'OFFENSE', 5000);
    await setUnits(defender.id, 'DEFENSE', 1000);
    await setUnits(defender.id, 'CITIZEN', 1000);

    const attackOnce = async () => {
      // The attacker bleeds too; refill the stack so every assault presses.
      await setUnits(attacker.id, 'OFFENSE', 5000);
      const outcome = await AttackService.executeAttack(
        attacker.id,
        defender.id,
        10,
      );
      expect(outcome.status).toBe('success');
      return prisma.attack_log.findFirstOrThrow({
        where: { defender_id: defender.id },
        orderBy: { id: 'desc' },
      });
    };

    const cap = reanimationDailyCap(1000);
    expect(cap).toBe(20);
    let cumulativePools = 0;
    let risenTotal = 0;
    for (let battle = 1; battle <= 4; battle += 1) {
      const log = await attackOnce();
      cumulativePools +=
        Math.floor(
          killedCombat(log, 'defender') *
            ownReanimationPercent(REANIMATION_FORT),
        ) +
        Math.floor(
          killedCombat(log, 'attacker') *
            enemyReanimationPercent(REANIMATION_FORT),
        );
      const expected = Math.min(cumulativePools, cap);
      risenTotal += reanimatedStat(log).defender;
      expect(risenTotal).toBe(expected);
      expect((await userRow(defender.id)).reanimated_today).toBe(expected);
      expect((await userRow(defender.id)).reanimation_cap).toBe(cap);
    }
    // The four battles' pools together exceed the cap, so the ledger really
    // bound and the excess was lost, never carried over.
    expect(cumulativePools).toBeGreaterThan(cap);
    expect((await userRow(defender.id)).reanimated_today).toBe(cap);

    // Next OT day: the ledger resets and the cap is measured afresh from the
    // army as it now stands.
    await prisma.users.update({
      where: { id: defender.id },
      data: { reanimation_day: getOTDayKey(new Date(Date.now() - 2 * DAY_MS)) },
    });
    const armyBeforeReset = await unitQuantity(defender.id, 'DEFENSE');
    const log = await attackOnce();
    const pool =
      Math.floor(
        killedCombat(log, 'defender') * ownReanimationPercent(REANIMATION_FORT),
      ) +
      Math.floor(
        killedCombat(log, 'attacker') *
          enemyReanimationPercent(REANIMATION_FORT),
      );
    const newCap = reanimationDailyCap(armyBeforeReset);
    const row = await userRow(defender.id);
    expect(row.reanimated_today).toBe(Math.min(pool, newCap));
    expect(row.reanimation_day).toBe(getOTDayKey());
    expect(row.reanimation_cap).toBe(newCap);
  });
});

describe('no reanimation when', () => {
  test('the admin switch (ENABLE_REANIMATION) is off', async () => {
    await setRuntimeSwitch('ENABLE_REANIMATION', false);
    const attacker = await createPlayer('Silent lich', 'UNDEAD');
    const defender = await createPlayer('Silent victim');
    await prisma.users.update({
      where: { id: attacker.id },
      data: { experience: UNPROTECTED_XP, fort_level: REANIMATION_FORT },
    });
    await prisma.users.update({
      where: { id: defender.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(attacker.id, 'OFFENSE', 5000);
    await setUnits(defender.id, 'DEFENSE', 2000);
    await setUnits(defender.id, 'CITIZEN', 1000);

    const outcome = await AttackService.executeAttack(
      attacker.id,
      defender.id,
      10,
    );
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: defender.id },
    });
    // The same battle raises units with the switch on (see the first test).
    expect(killedCombat(log, 'defender')).toBeGreaterThan(0);
    expect(reanimatedStat(log)).toEqual({ attacker: 0, defender: 0 });
    expect((await userRow(attacker.id)).reanimation_day).toBeNull();
  });

  test('neither side is Undead', async () => {
    const attacker = await createPlayer('Plain attacker');
    const defender = await createPlayer('Plain loser');
    await prisma.users.update({
      where: { id: attacker.id },
      data: { experience: UNPROTECTED_XP, fort_level: REANIMATION_FORT },
    });
    await prisma.users.update({
      where: { id: defender.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(attacker.id, 'OFFENSE', 5000);
    await setUnits(defender.id, 'DEFENSE', 500);
    await setUnits(defender.id, 'CITIZEN', 1000);

    const outcome = await AttackService.executeAttack(
      attacker.id,
      defender.id,
      10,
    );
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: defender.id },
    });
    expect(reanimatedStat(log)).toEqual({ attacker: 0, defender: 0 });
    expect((await userRow(attacker.id)).reanimation_day).toBeNull();
    expect((await userRow(defender.id)).reanimation_day).toBeNull();
  });

  test('the Undead player has not unlocked the feature (fort below 5)', async () => {
    const lockedAttacker = await createPlayer('Locked lich', 'UNDEAD');
    const lockedDefender = await createPlayer('Locked warden', 'UNDEAD');
    const victim = await createPlayer('Locked victim');
    await prisma.users.update({
      where: { id: lockedAttacker.id },
      data: { experience: UNPROTECTED_XP, fort_level: REANIMATION_FORT - 1 },
    });
    await prisma.users.update({
      where: { id: lockedDefender.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_level: REANIMATION_FORT - 1,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await prisma.users.update({
      where: { id: victim.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(lockedAttacker.id, 'OFFENSE', 5000);
    await setUnits(lockedDefender.id, 'DEFENSE', 500);
    await setUnits(lockedDefender.id, 'CITIZEN', 1000);
    await setUnits(victim.id, 'DEFENSE', 500);
    await setUnits(victim.id, 'CITIZEN', 1000);

    const attack = await AttackService.executeAttack(
      lockedAttacker.id,
      victim.id,
      10,
    );
    expect(attack.status).toBe('success');
    const attackLog = await prisma.attack_log.findFirstOrThrow({
      where: { attacker_id: lockedAttacker.id },
    });
    expect(reanimatedStat(attackLog)).toEqual({ attacker: 0, defender: 0 });
    expect((await userRow(lockedAttacker.id)).reanimation_day).toBeNull();

    // The same lock applies on defense: a locked Undead defender rises nothing.
    const defense = await AttackService.executeAttack(
      lockedAttacker.id,
      lockedDefender.id,
      10,
    );
    expect(defense.status).toBe('success');
    const defenseLog = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: lockedDefender.id },
      orderBy: { id: 'desc' },
    });
    expect(reanimatedStat(defenseLog)).toEqual({ attacker: 0, defender: 0 });
    expect((await userRow(lockedDefender.id)).reanimation_day).toBeNull();
  });

  test('the defender is protected as a new player', async () => {
    // Both fresh (0 XP) so the level range allows the attack; the defender
    // stays protected, so neither side's dead rise.
    const attacker = await createPlayer('Protected-battle lich', 'UNDEAD');
    const defender = await createPlayer('Protected-battle loser');
    await prisma.users.update({
      where: { id: attacker.id },
      data: { fort_level: REANIMATION_FORT },
    });
    await prisma.users.update({
      where: { id: defender.id },
      data: { fort_hitpoints: 1, house_level: 5 },
    });
    await setUnits(attacker.id, 'OFFENSE', 5000);
    await setUnits(defender.id, 'DEFENSE', 500);
    await setUnits(defender.id, 'CITIZEN', 1000);

    const outcome = await AttackService.executeAttack(
      attacker.id,
      defender.id,
      10,
    );
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: defender.id },
    });
    expect(log.stats).toMatchObject({ fort_breached: true });
    expect(reanimatedStat(log)).toEqual({ attacker: 0, defender: 0 });
    // The hook never even stamped the day.
    expect((await userRow(attacker.id)).reanimated_today).toBe(0);
    expect((await userRow(attacker.id)).reanimation_day).toBeNull();
  });

  test('the defender is on vacation (non-ACTIVE account)', async () => {
    const now = Date.now();
    const attacker = await createPlayer('Vacation lich', 'UNDEAD');
    const vacationer = await createPlayer('Vacation loser');
    await prisma.users.update({
      where: { id: attacker.id },
      data: { experience: UNPROTECTED_XP, fort_level: REANIMATION_FORT },
    });
    await prisma.users.update({
      where: { id: vacationer.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(attacker.id, 'OFFENSE', 5000);
    await setUnits(vacationer.id, 'DEFENSE', 500);
    await setUnits(vacationer.id, 'CITIZEN', 1000);
    await prisma.accountStatusHistory.create({
      data: {
        user_id: vacationer.id,
        status: 'VACATION',
        start_date: new Date(now - 4 * DAY_MS),
        reason: 'synthetic vacation',
      },
    });

    const outcome = await AttackService.executeAttack(
      attacker.id,
      vacationer.id,
      10,
    );
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: vacationer.id },
    });
    expect(reanimatedStat(log)).toEqual({ attacker: 0, defender: 0 });
    expect((await userRow(attacker.id)).reanimation_day).toBeNull();
  });
});

describe('interaction with the dungeon', () => {
  test('captured units are not dead and never rise for the Undead captor', async () => {
    const captor = await createPlayer('Dungeon lich', 'UNDEAD');
    const loser = await createPlayer('Dungeon loser');
    // A big army keeps the captor's own daily cap out of the way.
    await setUnits(captor.id, 'OFFENSE', 100_000);
    // The captor's own fallen plus 1000 enemy killed, of which the dungeon
    // took 100 captive: the enemy pool is 4%... scaled to 8% at fort 13, so
    // 72 rise from the enemy dead — not the 80 a naive 8%-of-killed would give.
    const outcome = await reanimate({
      attacker: {
        userId: captor.id,
        fortLevel: DUNGEON_FORT,
        economyLevel: 0,
        race: 'UNDEAD',
      },
      defender: {
        userId: loser.id,
        fortLevel: DUNGEON_FORT,
        economyLevel: 0,
        race: 'HUMAN',
      },
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 1000 }],
      defenderKilledUnits: [{ type: 'DEFENSE', level: 1, quantity: 1000 }],
      captivesTaken: 100,
    });
    expect(outcome.attacker).toEqual([
      { unitType: 'DEFENSE', quantity: 72 },
      { unitType: 'OFFENSE', quantity: 120 },
    ]);
    expect(outcome.defender).toEqual([]);
  });

  test('a breached win takes captives and reanimates in the same battle', async () => {
    await setShowDungeon(true);
    const captor = await createPlayer('Raiding lich', 'UNDEAD');
    const loser = await createPlayer('Raiding loser');
    await prisma.users.update({
      where: { id: captor.id },
      // Fort 13 unlocks both the dungeon and the scaled reanimation shares
      // (own 12%, enemy 8% — the enemy share's cap).
      data: { experience: UNPROTECTED_XP, fort_level: DUNGEON_FORT },
    });
    await prisma.users.update({
      where: { id: loser.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(captor.id, 'OFFENSE', 5000);
    await setUnits(loser.id, 'DEFENSE', 1000);
    await setUnits(loser.id, 'CITIZEN', 1000);

    const outcome = await AttackService.executeAttack(captor.id, loser.id, 10);
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: loser.id },
    });
    expect(log.winner).toBe(captor.id);
    const stats = log.stats as Record<string, number>;
    const captured = stats.captives_taken;
    expect(captured).toBeGreaterThan(0);
    expect(
      await prisma.captive.count({ where: { captorId: captor.id } }),
    ).toBeGreaterThan(0);

    // The enemy pool is computed on the dead (killed minus captured), and the
    // captives themselves sit in the dungeon, not on the captor's roster.
    const defenderKilled = killedCombat(log, 'defender');
    const enemyDead = defenderKilled - captured;
    expect(enemyDead).toBeGreaterThan(0);
    const attackerKilled = killedCombat(log, 'attacker');
    const ownPool = Math.floor(
      attackerKilled * ownReanimationPercent(DUNGEON_FORT),
    );
    const enemyPool = Math.floor(
      enemyDead * enemyReanimationPercent(DUNGEON_FORT),
    );
    const cap = reanimationDailyCap(5000);
    const expected = Math.min(ownPool + enemyPool, cap);
    expect(reanimatedStat(log)).toEqual({ attacker: expected, defender: 0 });
    expect((await userRow(captor.id)).reanimated_today).toBe(expected);
    const captivesHeld = await prisma.captive.aggregate({
      where: { captorId: captor.id },
      _sum: { quantity: true },
    });
    expect(captivesHeld._sum.quantity).toBe(captured);
  });
});

describe('Undead vs Undead', () => {
  test('both sides raise their own dead from the same battle', async () => {
    const attacker = await createPlayer('Lich invader', 'UNDEAD');
    const defender = await createPlayer('Lich warden', 'UNDEAD');
    await prisma.users.update({
      where: { id: attacker.id },
      data: { experience: UNPROTECTED_XP, fort_level: REANIMATION_FORT },
    });
    await prisma.users.update({
      where: { id: defender.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_level: REANIMATION_FORT,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(attacker.id, 'OFFENSE', 5000);
    await setUnits(defender.id, 'DEFENSE', 2000);
    await setUnits(defender.id, 'CITIZEN', 1000);

    const outcome = await AttackService.executeAttack(
      attacker.id,
      defender.id,
      10,
    );
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: defender.id },
    });

    const attackerKilled = killedCombat(log, 'attacker');
    const defenderKilled = killedCombat(log, 'defender');
    const attackerOwnPool = Math.floor(
      attackerKilled * ownReanimationPercent(REANIMATION_FORT),
    );
    const attackerEnemyPool = Math.floor(
      defenderKilled * enemyReanimationPercent(REANIMATION_FORT),
    );
    const defenderOwnPool = Math.floor(
      defenderKilled * ownReanimationPercent(REANIMATION_FORT),
    );
    const defenderEnemyPool = Math.floor(
      attackerKilled * enemyReanimationPercent(REANIMATION_FORT),
    );
    // Each side's cap comes from its own army: 5000 -> 100, 2000 -> 40.
    const attackerExpected = Math.min(
      attackerOwnPool + attackerEnemyPool,
      reanimationDailyCap(5000),
    );
    const defenderExpected = Math.min(
      defenderOwnPool + defenderEnemyPool,
      reanimationDailyCap(2000),
    );
    expect(attackerExpected).toBeGreaterThan(0);
    expect(defenderExpected).toBeGreaterThan(0);
    expect(reanimatedStat(log)).toEqual({
      attacker: attackerExpected,
      defender: defenderExpected,
    });

    // Both ledgers are independent and both rosters gained level-1 units.
    expect((await userRow(attacker.id)).reanimated_today).toBe(
      attackerExpected,
    );
    expect((await userRow(defender.id)).reanimated_today).toBe(
      defenderExpected,
    );
    const loggedAttacker = loggedUnits(log, 'attacker');
    const loggedDefender = loggedUnits(log, 'defender');
    expect(
      (await unitQuantity(attacker.id, 'OFFENSE', 1)) -
        (loggedAttacker['OFFENSE:1'] ?? 0) +
        (await unitQuantity(attacker.id, 'DEFENSE', 1)) -
        (loggedAttacker['DEFENSE:1'] ?? 0),
    ).toBe(attackerExpected);
    expect(
      (await unitQuantity(defender.id, 'OFFENSE', 1)) -
        (loggedDefender['OFFENSE:1'] ?? 0) +
        (await unitQuantity(defender.id, 'DEFENSE', 1)) -
        (loggedDefender['DEFENSE:1'] ?? 0),
    ).toBe(defenderExpected);
  });
});

describe('report redaction', () => {
  test('the opponent and shared viewers never learn how many rose', async () => {
    const attacker = await createPlayer('Redaction lich', 'UNDEAD');
    const defender = await createPlayer('Redaction warden', 'UNDEAD');
    await prisma.users.update({
      where: { id: attacker.id },
      data: { experience: UNPROTECTED_XP, fort_level: REANIMATION_FORT },
    });
    await prisma.users.update({
      where: { id: defender.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_level: REANIMATION_FORT,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    await setUnits(attacker.id, 'OFFENSE', 5000);
    await setUnits(defender.id, 'DEFENSE', 2000);
    await setUnits(defender.id, 'CITIZEN', 1000);

    const outcome = await AttackService.executeAttack(
      attacker.id,
      defender.id,
      10,
    );
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: defender.id },
      include: {
        attackerPlayer: {
          select: {
            id: true,
            display_name: true,
            avatar: true,
            race: true,
            experience: true,
          },
        },
        defenderPlayer: {
          select: {
            id: true,
            display_name: true,
            avatar: true,
            race: true,
            experience: true,
          },
        },
      },
    });
    const stat = reanimatedStat(log);
    expect(stat.attacker).toBeGreaterThan(0);
    expect(stat.defender).toBeGreaterThan(0);

    const asAttacker = redactAttackLogForViewer(log, 'attacker');
    expect(asAttacker.stats.reanimated_units).toBe(stat.attacker);
    const asDefender = redactAttackLogForViewer(log, 'defender');
    expect(asDefender.stats.reanimated_units).toBe(stat.defender);
    const asShared = redactAttackLogForViewer(log, 'shared');
    expect(asShared.stats).not.toHaveProperty('reanimated_units');
  });
});

describe('concurrent attacks on one Undead defender', () => {
  test('never exceed the day cap between them', async () => {
    const defender = await createPlayer('Dogpiled warden', 'UNDEAD');
    const attackerA = await createPlayer('Dogpile attacker A');
    const attackerB = await createPlayer('Dogpile attacker B');
    await prisma.users.update({
      where: { id: defender.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_level: REANIMATION_FORT,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    for (const attacker of [attackerA, attackerB]) {
      await prisma.users.update({
        where: { id: attacker.id },
        data: { experience: UNPROTECTED_XP },
      });
      await setUnits(attacker.id, 'OFFENSE', 5000);
    }
    // A 1000-strong army caps the day at 20; an earlier battle already used
    // 15, so only 5 may rise between the two concurrent attacks.
    await setUnits(defender.id, 'DEFENSE', 1000);
    await setUnits(defender.id, 'CITIZEN', 1000);
    await prisma.users.update({
      where: { id: defender.id },
      data: {
        reanimated_today: 15,
        reanimation_day: getOTDayKey(),
        reanimation_cap: reanimationDailyCap(1000),
      },
    });

    const results = await Promise.all([
      AttackService.executeAttack(attackerA.id, defender.id, 10),
      AttackService.executeAttack(attackerB.id, defender.id, 10),
    ]);
    for (const result of results) expect(result.status).toBe('success');

    const logs = await prisma.attack_log.findMany({
      where: { defender_id: defender.id },
      orderBy: { id: 'asc' },
    });
    expect(logs).toHaveLength(2);
    const risen = logs.map((log) => reanimatedStat(log).defender);
    // Both pools together far exceed the 5 remaining; the ledger serialises
    // the two battles on the defender's row lock, so exactly 5 rise in total.
    const pools = logs.reduce((sum, log) => {
      const ownPool = Math.floor(
        killedCombat(log, 'defender') * ownReanimationPercent(REANIMATION_FORT),
      );
      const enemyPool = Math.floor(
        killedCombat(log, 'attacker') *
          enemyReanimationPercent(REANIMATION_FORT),
      );
      return sum + ownPool + enemyPool;
    }, 0);
    expect(pools).toBeGreaterThan(5);
    expect(risen.reduce((sum, value) => sum + value, 0)).toBe(5);
    for (const value of risen) expect(value).toBeGreaterThanOrEqual(0);

    const row = await userRow(defender.id);
    expect(row.reanimated_today).toBe(20);
    expect(row.reanimated_today).toBeLessThanOrEqual(row.reanimation_cap);
    expect(row.reanimation_cap).toBe(reanimationDailyCap(1000));
  });
});

describe('era rollover', () => {
  test('clears the ledger along with the army', async () => {
    const undead = await createPlayer('Rollover lich', 'UNDEAD');
    const human = await createPlayer('Rollover victim');
    await prisma.users.update({
      where: { id: undead.id },
      data: { experience: UNPROTECTED_XP, fort_level: REANIMATION_FORT },
    });
    await setUnits(undead.id, 'OFFENSE', 5000);
    const outcome = await reanimate({
      attacker: {
        userId: undead.id,
        fortLevel: REANIMATION_FORT,
        economyLevel: 0,
        race: 'UNDEAD',
      },
      defender: {
        userId: human.id,
        fortLevel: REANIMATION_FORT,
        economyLevel: 0,
        race: 'HUMAN',
      },
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 1000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
    });
    expect(reanimatedUnitsTotal(outcome.attacker)).toBe(80);
    await prisma.$transaction((tx) =>
      ReanimationService.applyReanimatedUnits(tx, undead.id, outcome.attacker),
    );
    expect((await userRow(undead.id)).reanimated_today).toBe(80);

    await startNewEra();

    const row = await userRow(undead.id);
    expect(row.reanimated_today).toBe(0);
    expect(row.reanimation_day).toBeNull();
    expect(row.reanimation_cap).toBe(0);
    // The reset wiped the army, risers included.
    expect(await unitQuantity(undead.id, 'OFFENSE', 1)).toBe(0);
  });
});
