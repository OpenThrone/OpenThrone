/**
 * Adversarial edge coverage for Undead reanimation (#211).
 *
 * Every test here asserts the CORRECT behaviour of a rule from the ticket:
 *   only UNDEAD players at fort >= 5 rise; own 8% + enemy 4% (+0.5pp/level,
 *   capped 15% / 8%); mercenaries, alliance forces, citizens and captured units
 *   are not in the pools; the result is level-1 units of the same type; the
 *   daily cap is 2% of the trained army measured at the first battle of the OT
 *   day and is shared across that day's battles; the opponent never sees the
 *   count; retries never reanimate twice.
 *
 * The point is to attack the boundaries: cap farming, stack splitting, cap
 * basis inflation, exclusions, race/fort changes mid-day, the OT midnight
 * boundary, era resets, Undead vs Undead at cap, one player in two battles at
 * once, zero-loss defenders, reanimated units re-counted toward the next day's
 * cap, redaction, and the API endpoint for other races and anonymous readers.
 *
 * When a test fails it is because the source is wrong: the test is kept and
 * the source is not changed.
 */
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';

import {
  enemyReanimationPercent,
  ownReanimationPercent,
  REANIMATION_FORT_LEVEL,
  reanimationDailyCap,
  type ReanimationFallenRow,
} from '@/constants/Reanimation';
import prisma from '@/lib/prisma';
import { redactAttackLogForViewer } from '@/services/AttackLogAccess.service';
import { AttackService } from '@/services/AttackService';
import { startNewEra } from '@/services/Era.service';
import {
  reanimatedUnitsTotal,
  ReanimationService,
} from '@/services/Reanimation.service';
import { createUser } from '@/services/User.service';
import { getOTDayKey, otWallClockToDate } from '@/utils/timefunctions';

import { resetDatabase } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Level 10 (80k XP) ends new-player protection by the LEVEL rule. */
const UNPROTECTED_XP = 80_000;
/** The fort level that unlocks reanimation (an Outpost Level 2). */
const REANIMATION_FORT = REANIMATION_FORT_LEVEL;

const COMBAT_TYPES = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] as const;

/** A fallen row that can also carry the combat engine's forceKind flag. */
type FallenRowWithForce = ReanimationFallenRow & {
  forceKind?: 'MERCENARY' | 'ALLIANCE';
};

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
      name: 'Reanimation edges era',
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

const side = (userId: number, race: string | null, fortLevel: number) => ({
  userId,
  race,
  fortLevel,
  economyLevel: 0,
});

let eraId: number;

beforeEach(async () => {
  await resetDatabase();
  eraId = (await seedEra()).id;
});

// ---------------------------------------------------------------------------
// 1. Cap farming: a huge level-1 army on the alt cannot beat the daily cap.
// ---------------------------------------------------------------------------
describe('cap farming', () => {
  test('an Undead attacker with a small army cannot farm a huge alt past its 2% cap', async () => {
    const attacker = await createPlayer('Cap farmer', 'UNDEAD');
    const alt = await createPlayer('Cap alt');
    await setUnits(attacker.id, 'OFFENSE', 1000);
    await setUnits(alt.id, 'DEFENSE', 100_000);

    // The alt's 100,000 level-1 defenders would feed a 4,000-unit enemy pool if
    // the cap were ignored; the attacker's own 1,000 fallen add 80 more. The
    // 2%-of-1,000 daily cap (20) is the binding limit.
    const outcome = await reanimate({
      attacker: side(attacker.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(alt.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 1000 }],
      defenderKilledUnits: [{ type: 'DEFENSE', level: 1, quantity: 100_000 }],
      captivesTaken: 0,
      now: otWallClockToDate(2026, 10, 27, 12, 0, 0),
    });

    const rawPool =
      Math.floor(1000 * ownReanimationPercent(REANIMATION_FORT)) +
      Math.floor(100_000 * enemyReanimationPercent(REANIMATION_FORT));
    const cap = reanimationDailyCap(1000);
    expect(cap).toBe(20);
    // The raw pool is far above the cap, so the cap really is the binding limit.
    expect(rawPool).toBeGreaterThan(cap);
    expect(reanimatedUnitsTotal(outcome.attacker)).toBe(cap);
    expect(outcome.defender).toEqual([]);
    expect((await userRow(attacker.id)).reanimated_today).toBe(cap);
    expect((await userRow(attacker.id)).reanimation_cap).toBe(cap);
  });
});

// ---------------------------------------------------------------------------
// 2. Splitting stacks into many tiny rows must not dodge or inflate rounding.
// ---------------------------------------------------------------------------
describe('stack splitting', () => {
  test('1000 fallen split into 1000 rows of 1 still yields exactly 8% (80)', async () => {
    const undead = await createPlayer('Split row lich', 'UNDEAD');
    const human = await createPlayer('Split row victim');
    await setUnits(undead.id, 'OFFENSE', 10_000);

    const outcome = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: Array.from({ length: 1000 }, () => ({
        type: 'OFFENSE' as const,
        level: 1,
        quantity: 1,
      })),
      defenderKilledUnits: [],
      captivesTaken: 0,
    });

    // 8% of 1000 is 80; largest-remainder distribution must keep the total.
    expect(reanimatedUnitsTotal(outcome.attacker)).toBe(80);
    expect(outcome.attacker).toEqual([{ unitType: 'OFFENSE', quantity: 80 }]);
  });

  test('one row of 1000 and 1000 rows of 1 give the same total', async () => {
    const undead = await createPlayer('Split equality lich', 'UNDEAD');
    const human = await createPlayer('Split equality victim');
    await setUnits(undead.id, 'OFFENSE', 10_000);

    const single = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 1000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
    });
    const split = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: Array.from({ length: 1000 }, () => ({
        type: 'OFFENSE' as const,
        level: 1,
        quantity: 1,
      })),
      defenderKilledUnits: [],
      captivesTaken: 0,
    });

    expect(reanimatedUnitsTotal(split.attacker)).toBe(
      reanimatedUnitsTotal(single.attacker),
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Inflating the daily cap by training right before the first battle.
// ---------------------------------------------------------------------------
describe('daily cap basis inflation', () => {
  test('training before the first battle sets a big cap; releasing afterwards does not shrink it', async () => {
    const undead = await createPlayer('Inflating lich', 'UNDEAD');
    const human = await createPlayer('Inflating victim');
    // Start with 1000 trained units: a 20-unit cap.
    await setUnits(undead.id, 'OFFENSE', 1000);
    const baseCap = reanimationDailyCap(1000);
    expect(baseCap).toBe(20);

    // "Recruit" 100,000 units immediately before the first battle.
    await setUnits(undead.id, 'OFFENSE', 101_000);
    const first = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 10_000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
      now: otWallClockToDate(2026, 10, 27, 12, 0, 0),
    });
    const inflatedCap = reanimationDailyCap(101_000);
    expect(inflatedCap).toBe(2020);
    expect((await userRow(undead.id)).reanimation_cap).toBe(inflatedCap);
    // 8% of 10,000 = 800, under the inflated cap.
    expect(reanimatedUnitsTotal(first.attacker)).toBe(800);

    // "Release" the 100,000 units: the army is back to 1000 + 800 risers = 1800.
    await setUnits(undead.id, 'OFFENSE', 1000);
    const second = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 10_000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
      now: otWallClockToDate(2026, 10, 27, 18, 0, 0),
    });

    // The ledger is sticky: the released army does not recalculate the cap.
    const row = await userRow(undead.id);
    expect(row.reanimation_cap).toBe(inflatedCap);
    expect(row.reanimation_day).toBe('2026-10-27');
    // 800 + 800 = 1600, still under 2020.
    expect(row.reanimated_today).toBe(1600);
    expect(reanimatedUnitsTotal(second.attacker)).toBe(800);
  });
});

// ---------------------------------------------------------------------------
// 4. Exclusions: mercenaries, alliance forces, citizens and captured units.
// ---------------------------------------------------------------------------
describe('pool exclusions', () => {
  test('mercenaries and citizens never enter the pools', async () => {
    const undead = await createPlayer('Picky lich', 'UNDEAD');
    const human = await createPlayer('Picky victim');
    await setUnits(undead.id, 'OFFENSE', 10_000);
    const outcome = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [
        { type: 'OFFENSE', level: 1, quantity: 500, isMercenary: true },
        { type: 'CITIZEN', level: 1, quantity: 500 },
      ],
      defenderKilledUnits: [
        { type: 'DEFENSE', level: 1, quantity: 500, isMercenary: true },
        { type: 'CITIZEN', level: 1, quantity: 500 },
      ],
      captivesTaken: 0,
    });
    expect(outcome.attacker).toEqual([]);
    expect(outcome.defender).toEqual([]);
  });

  test('alliance forces are excluded from the pool', async () => {
    const undead = await createPlayer('Alliance lich', 'UNDEAD');
    const human = await createPlayer('Alliance victim');
    await setUnits(undead.id, 'OFFENSE', 10_000);
    const allianceFallen: FallenRowWithForce[] = [
      {
        type: 'OFFENSE',
        level: 1,
        quantity: 1000,
        forceKind: 'ALLIANCE',
        isMercenary: false,
      },
    ];
    const outcome = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: allianceFallen,
      defenderKilledUnits: [],
      captivesTaken: 0,
    });
    // Alliance forces are not the Undead player's own dead: nothing rises.
    expect(reanimatedUnitsTotal(outcome.attacker)).toBe(0);
  });

  test('captured units are removed from the enemy pool', async () => {
    const undead = await createPlayer('Captive lich', 'UNDEAD');
    const human = await createPlayer('Captive victim');
    await setUnits(undead.id, 'OFFENSE', 10_000);
    const outcome = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [],
      defenderKilledUnits: [{ type: 'DEFENSE', level: 1, quantity: 1000 }],
      captivesTaken: 1000,
    });
    // Every killed defender is a captive: no dead, no enemy pool.
    expect(outcome.attacker).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Race change or fort downgrade mid-day.
// ---------------------------------------------------------------------------
describe('mid-day eligibility changes', () => {
  test('a race change stops further reanimation on the same day', async () => {
    const undead = await createPlayer('Changing lich', 'UNDEAD');
    const human = await createPlayer('Changing victim');
    await setUnits(undead.id, 'OFFENSE', 10_000);

    const first = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 1000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
      now: otWallClockToDate(2026, 10, 27, 10, 0, 0),
    });
    expect(reanimatedUnitsTotal(first.attacker)).toBe(80);
    const used = (await userRow(undead.id)).reanimated_today;
    expect(used).toBe(80);

    // The player switches to HUMAN mid-day.
    await prisma.users.update({
      where: { id: undead.id },
      data: { race: 'HUMAN' },
    });
    const second = await reanimate({
      attacker: side(undead.id, 'HUMAN', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 1000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
      now: otWallClockToDate(2026, 10, 27, 14, 0, 0),
    });
    expect(second.attacker).toEqual([]);
    expect((await userRow(undead.id)).reanimated_today).toBe(used);
  });

  test('a fort downgrade below 5 stops further reanimation on the same day', async () => {
    const undead = await createPlayer('Downgrading lich', 'UNDEAD');
    const human = await createPlayer('Downgrading victim');
    await setUnits(undead.id, 'OFFENSE', 10_000);

    await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 1000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
      now: otWallClockToDate(2026, 10, 27, 10, 0, 0),
    });
    const used = (await userRow(undead.id)).reanimated_today;

    await prisma.users.update({
      where: { id: undead.id },
      data: { fort_level: REANIMATION_FORT - 1 },
    });
    const second = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT - 1),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 1000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
      now: otWallClockToDate(2026, 10, 27, 14, 0, 0),
    });
    expect(second.attacker).toEqual([]);
    expect((await userRow(undead.id)).reanimated_today).toBe(used);
  });
});

// ---------------------------------------------------------------------------
// 6. The OT midnight boundary resets the ledger and the cap.
// ---------------------------------------------------------------------------
describe('OT day boundary', () => {
  test('a battle just before and just after midnight uses different day keys', async () => {
    const undead = await createPlayer('Midnight lich', 'UNDEAD');
    const human = await createPlayer('Midnight victim');
    await setUnits(undead.id, 'OFFENSE', 10_000);

    const before = otWallClockToDate(2026, 10, 27, 23, 59, 59);
    const after = otWallClockToDate(2026, 10, 28, 0, 0, 1);
    expect(getOTDayKey(before)).toBe('2026-10-27');
    expect(getOTDayKey(after)).toBe('2026-10-28');

    const first = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 1000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
      now: before,
    });
    expect(reanimatedUnitsTotal(first.attacker)).toBe(80);
    expect((await userRow(undead.id)).reanimation_day).toBe('2026-10-27');

    const second = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 1000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
      now: after,
    });
    expect(reanimatedUnitsTotal(second.attacker)).toBe(80);
    const row = await userRow(undead.id);
    expect(row.reanimation_day).toBe('2026-10-28');
    // The day's total is reset, so the second 80 is not added to the first.
    expect(row.reanimated_today).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// 7. Era reset mid-day clears the ledger.
// ---------------------------------------------------------------------------
describe('era reset mid-day', () => {
  test('clears the ledger and the cap even after a battle earlier that day', async () => {
    const undead = await createPlayer('Era reset lich', 'UNDEAD');
    const human = await createPlayer('Era reset victim');
    await setUnits(undead.id, 'OFFENSE', 10_000);

    const outcome = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 1000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
    });
    expect(reanimatedUnitsTotal(outcome.attacker)).toBe(80);
    expect((await userRow(undead.id)).reanimated_today).toBe(80);

    await startNewEra();

    const row = await userRow(undead.id);
    expect(row.reanimated_today).toBe(0);
    expect(row.reanimation_day).toBeNull();
    expect(row.reanimation_cap).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Undead vs Undead with both sides already at their daily cap.
// ---------------------------------------------------------------------------
describe('Undead vs Undead at cap', () => {
  test('both at cap rise nothing and the ledgers stay full', async () => {
    const attacker = await createPlayer('Capped lich A', 'UNDEAD');
    const defender = await createPlayer('Capped lich D', 'UNDEAD');
    await prisma.users.update({
      where: { id: attacker.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_level: REANIMATION_FORT,
        reanimated_today: reanimationDailyCap(5000),
        reanimation_day: getOTDayKey(),
        reanimation_cap: reanimationDailyCap(5000),
      },
    });
    await prisma.users.update({
      where: { id: defender.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_level: REANIMATION_FORT,
        fort_hitpoints: 1,
        house_level: 5,
        reanimated_today: reanimationDailyCap(2000),
        reanimation_day: getOTDayKey(),
        reanimation_cap: reanimationDailyCap(2000),
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
    expect(reanimatedStat(log)).toEqual({ attacker: 0, defender: 0 });
    expect((await userRow(attacker.id)).reanimated_today).toBe(
      reanimationDailyCap(5000),
    );
    expect((await userRow(defender.id)).reanimated_today).toBe(
      reanimationDailyCap(2000),
    );
  });
});

// ---------------------------------------------------------------------------
// 9. One Undead player in two battles at once: attacker in one, defender in another.
// ---------------------------------------------------------------------------
describe('concurrent battles on one Undead attacker and defender', () => {
  test('the shared ledger never exceeds the cap across both battles', async () => {
    const undead = await createPlayer('Double-duty lich', 'UNDEAD');
    const humanA = await createPlayer('Double-duty human A');
    const humanB = await createPlayer('Double-duty human B');
    await prisma.users.update({
      where: { id: undead.id },
      data: {
        experience: UNPROTECTED_XP,
        fort_level: REANIMATION_FORT,
        fort_hitpoints: 1,
        house_level: 5,
      },
    });
    for (const human of [humanA, humanB]) {
      await prisma.users.update({
        where: { id: human.id },
        data: {
          experience: UNPROTECTED_XP,
          fort_hitpoints: 1,
          house_level: 5,
        },
      });
      await setUnits(human.id, 'OFFENSE', 5000);
      await setUnits(human.id, 'DEFENSE', 1000);
      await setUnits(human.id, 'CITIZEN', 1000);
    }
    await setUnits(undead.id, 'OFFENSE', 10_000);
    await setUnits(undead.id, 'DEFENSE', 10_000);
    await setUnits(undead.id, 'CITIZEN', 1000);
    const cap = reanimationDailyCap(20_000);
    expect(cap).toBe(400);

    // The same Undead row is the attacker in one battle and the defender in
    // the other; both transactions contend for its ledger.
    const results = await Promise.all([
      AttackService.executeAttack(undead.id, humanA.id, 10),
      AttackService.executeAttack(humanB.id, undead.id, 10),
    ]);
    for (const result of results) expect(result.status).toBe('success');

    const asAttacker = await prisma.attack_log.findFirstOrThrow({
      where: { attacker_id: undead.id, defender_id: humanA.id },
    });
    const asDefender = await prisma.attack_log.findFirstOrThrow({
      where: { attacker_id: humanB.id, defender_id: undead.id },
    });
    const risenAttacker = reanimatedStat(asAttacker).attacker;
    const risenDefender = reanimatedStat(asDefender).defender;
    const totalRisen = risenAttacker + risenDefender;

    // The two battles' raw pools together exceed the cap; the ledger serialises
    // them on the row lock so the total cannot pass it.
    expect(totalRisen).toBeLessThanOrEqual(cap);
    const row = await userRow(undead.id);
    expect(row.reanimated_today).toBe(totalRisen);
    expect(row.reanimation_cap).toBe(cap);
  });
});

// ---------------------------------------------------------------------------
// 10. A zero-loss Undead defender still rises from the attacker's dead.
// ---------------------------------------------------------------------------
describe('zero-loss defender', () => {
  test('a defender with no own losses still rises 4% of the attacker dead', async () => {
    const undead = await createPlayer('Zero-loss warden', 'UNDEAD');
    const human = await createPlayer('Zero-loss attacker');
    await setUnits(undead.id, 'DEFENSE', 10_000);
    const outcome = await reanimate({
      attacker: side(human.id, 'HUMAN', REANIMATION_FORT),
      defender: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 1000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
    });
    // Own pool 0; enemy pool is 4% of 1000 = 40. The daily cap is 200.
    expect(reanimatedUnitsTotal(outcome.defender)).toBe(40);
    expect(outcome.defender).toEqual([{ unitType: 'OFFENSE', quantity: 40 }]);
    expect(outcome.attacker).toEqual([]);
  });

  test('a protected defender yields nothing for either side', async () => {
    const attacker = await createPlayer('Protected edge lich', 'UNDEAD');
    const defender = await createPlayer('Protected edge loser');
    await prisma.users.update({
      where: { id: attacker.id },
      data: { fort_level: REANIMATION_FORT },
    });
    await prisma.users.update({
      where: { id: defender.id },
      data: { fort_hitpoints: 1, house_level: 5 },
    });
    await setUnits(attacker.id, 'OFFENSE', 10_000);
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
  });
});

// ---------------------------------------------------------------------------
// 11. Reanimated units count toward the next day's cap basis.
// ---------------------------------------------------------------------------
describe('reanimated units and the next day cap', () => {
  test('risers from day 1 are part of the army measured on day 2', async () => {
    const undead = await createPlayer('Basis lich', 'UNDEAD');
    const human = await createPlayer('Basis victim');
    // 10,000 trained units -> 200 cap. 800 own dead -> 800 pool, capped at 200.
    await setUnits(undead.id, 'OFFENSE', 10_000);
    const first = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [{ type: 'OFFENSE', level: 1, quantity: 10_000 }],
      defenderKilledUnits: [],
      captivesTaken: 0,
      now: otWallClockToDate(2026, 10, 27, 12, 0, 0),
    });
    expect(reanimatedUnitsTotal(first.attacker)).toBe(200);
    await prisma.$transaction((tx) =>
      ReanimationService.applyReanimatedUnits(tx, undead.id, first.attacker),
    );
    expect(await unitQuantity(undead.id, 'OFFENSE', 1)).toBe(10_200);

    const second = await reanimate({
      attacker: side(undead.id, 'UNDEAD', REANIMATION_FORT),
      defender: side(human.id, 'HUMAN', REANIMATION_FORT),
      attackerKilledUnits: [],
      defenderKilledUnits: [],
      captivesTaken: 0,
      now: otWallClockToDate(2026, 10, 28, 12, 0, 0),
    });
    // The day's first battle measures the 10,200 army, risers included:
    // floor(10,200 * 0.02) = 204, not 200.
    expect((await userRow(undead.id)).reanimation_cap).toBe(204);
    expect(second.attacker).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 12. Report redaction for attacker, defender and a third viewer.
// ---------------------------------------------------------------------------
describe('report redaction', () => {
  test('only the matching side sees its own count; a third viewer sees neither', async () => {
    const attacker = await createPlayer('Redact edge lich', 'UNDEAD');
    const defender = await createPlayer('Redact edge human');
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
    await setUnits(attacker.id, 'OFFENSE', 10_000);
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
    const stat = reanimatedStat(log);
    expect(stat.attacker).toBeGreaterThan(0);
    expect(stat.defender).toBe(0);

    const asAttacker = redactAttackLogForViewer(log, 'attacker');
    expect(asAttacker.stats.reanimated_units).toBe(stat.attacker);
    const asDefender = redactAttackLogForViewer(log, 'defender');
    // The defender is HUMAN: its own count is 0 and the attacker's count is not leaked.
    expect(asDefender.stats.reanimated_units).toBe(0);
    const asShared = redactAttackLogForViewer(log, 'shared');
    expect(asShared.stats).not.toHaveProperty('reanimated_units');
  });
});

// ---------------------------------------------------------------------------
// 13. The API endpoint for other races and anonymous readers.
// ---------------------------------------------------------------------------
describe('reanimation API', () => {
  interface FakeResponse {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
    status(code: number): FakeResponse;
    json(payload: unknown): FakeResponse;
    setHeader(name: string, value: string): FakeResponse;
    end(): FakeResponse;
  }

  const makeRes = (): FakeResponse => {
    const res: FakeResponse = {
      statusCode: 200,
      body: undefined,
      headers: {},
      status(code) {
        res.statusCode = code;
        return res;
      },
      json(payload) {
        res.body = payload;
        return res;
      },
      setHeader(name, value) {
        res.headers[name] = value;
        return res;
      },
      end() {
        return res;
      },
    };
    return res;
  };

  const callRoute = async (
    handler: (req: unknown, res: unknown) => Promise<unknown>,
    options: { userId?: number } = {},
  ): Promise<FakeResponse> => {
    const res = makeRes();
    const req: Record<string, unknown> = {
      method: 'GET',
      query: {},
      headers: {},
      cookies: {},
    };
    if (options.userId !== undefined)
      req.session = { user: { id: options.userId } };
    await handler(req, res);
    return res;
  };

  let reanimationHandler: (req: unknown, res: unknown) => Promise<unknown>;

  beforeAll(async () => {
    mock.module('@/middleware/apiGuard', () => ({
      withApiGuard: () => (handler: unknown) => handler,
    }));
    mock.module('@/middleware/auth', () => ({
      withAuth: (handler: unknown) => handler,
    }));
    reanimationHandler = (
      (await import('@/pages/api/kingdom/reanimation')) as {
        default: typeof reanimationHandler;
      }
    ).default;
    mock.restore();
  });

  test('a non-Undead player gets race HUMAN and unlocked false', async () => {
    const human = await createPlayer('Api human');
    await setUnits(human.id, 'OFFENSE', 5000);
    const res = await callRoute(reanimationHandler, { userId: human.id });
    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.race).toBe('HUMAN');
    expect(body.unlocked).toBe(false);
    expect(body.reanimatedToday).toBe(0);
    expect(body.dailyCap).toBe(reanimationDailyCap(5000));
  });

  test('an unauthenticated request is rejected with 401', async () => {
    const res = await callRoute(reanimationHandler);
    expect(res.statusCode).toBe(401);
    expect((res.body as Record<string, unknown>).message).toBe('Unauthorized');
  });
});
