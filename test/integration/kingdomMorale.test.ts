import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

import prisma from '@/lib/prisma';
import { AttackService } from '@/services/AttackService';
import { CronJobService } from '@/services/CronJob.service';
import { MercenaryService } from '@/services/Mercenary.service';
import { createUser } from '@/services/User.service';
import { getOTDayKey } from '@/utils/timefunctions';

import { resetDatabase, setDesertion, setRuntimeSwitch } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Level 10 (80k XP) ends new-player protection by the LEVEL rule. */
const UNPROTECTED_XP = 80_000;

const createPlayer = (name: string) =>
  createUser(
    `${name.toLowerCase().replace(/\s+/g, '-')}@example.test`,
    'not-a-real-hash',
    name,
    'HUMAN',
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

const unitQuantity = async (userId: number, type: string) => {
  const rows = await prisma.userUnit.findMany({
    where: { userId, type, isMercenary: false },
  });
  return rows.reduce((sum, row) => sum + row.quantity, 0);
};

const userRow = (userId: number) =>
  prisma.users.findUniqueOrThrow({ where: { id: userId } });

/** Citizens the daily pass granted this user (reconcile intake around it). */
const citizensGranted = async (userId: number) => {
  const rows = await prisma.bank_history.findMany({
    where: { to_user_id: userId, history_type: 'DAILY_RECRUIT' },
  });
  return rows.reduce((sum, row) => {
    const stats = row.stats as {
      newCitizens: number;
      currentCitizens: number;
    };
    return sum + (Number(stats.newCitizens) - Number(stats.currentCitizens));
  }, 0);
};

/**
 * Simulates the OT day rolling over: back-date every kingdom's morale day
 * marker so the next daily pass applies again. The pass is idempotent per
 * OT day (users.kingdom_morale_day), so multi-day scenarios in one test call
 * this between processDailyUpdates() runs.
 */
const nextDay = () =>
  prisma.users.updateMany({
    data: { kingdom_morale_day: getOTDayKey(new Date(Date.now() - DAY_MS)) },
  });

/** An era that started long enough ago that 17-day-inactive players still count as participants. */
const seedEra = () =>
  prisma.era.create({
    data: { name: 'Morale era', startDate: new Date(Date.now() - 20 * DAY_MS) },
  });

beforeEach(async () => {
  await resetDatabase();
  // Desertion is an admin switch, off by default; these suites test it on.
  await setDesertion(true);
  await seedEra();
});

describe('kingdom morale moves with battle outcomes', () => {
  test('a lost defense costs 3 morale and accrues pressure; a repelled attack pays 2 and recovers pressure', async () => {
    const attacker = await createPlayer('Morale attacker');
    const loser = await createPlayer('Morale loser');
    const attacker2 = await createPlayer('Weary attacker');
    const stronghold = await createPlayer('Stronghold');
    for (const id of [attacker.id, attacker2.id, loser.id, stronghold.id]) {
      await prisma.users.update({
        where: { id },
        data: { experience: UNPROTECTED_XP },
      });
    }
    await setUnits(attacker.id, 'OFFENSE', 5000);
    await setUnits(attacker2.id, 'OFFENSE', 50);
    await setUnits(loser.id, 'DEFENSE', 100);
    await setUnits(stronghold.id, 'DEFENSE', 100000);
    await prisma.users.update({
      where: { id: stronghold.id },
      data: {
        kingdom_morale: 90,
        defense_pressure_today: 60,
        defense_pressure_date: new Date(),
      },
    });

    const won = await AttackService.executeAttack(attacker.id, loser.id, 5);
    expect(won.status).toBe('success');
    expect(
      (
        await prisma.attack_log.findFirstOrThrow({
          where: { defender_id: loser.id },
        })
      ).winner,
    ).toBe(attacker.id);
    const loserRow = await userRow(loser.id);
    expect(loserRow.kingdom_morale).toBe(97);
    expect(loserRow.defense_pressure_today).toBe(5);

    const repelled = await AttackService.executeAttack(
      attacker2.id,
      stronghold.id,
      5,
    );
    expect(repelled.status).toBe('success');
    expect(
      (
        await prisma.attack_log.findFirstOrThrow({
          where: { defender_id: stronghold.id },
        })
      ).winner,
    ).toBe(stronghold.id);
    const strongRow = await userRow(stronghold.id);
    expect(strongRow.kingdom_morale).toBe(92);
    // A repelled attack nets +ceil(turns/2): 60 pressure plus half of the
    // repelled attack's 5 turns (rounded up) = 63. Pressure other attackers
    // built up today is never refunded.
    expect(strongRow.defense_pressure_today).toBe(63);
    // The applied garrison fatigue rides along on the report (#204).
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: stronghold.id },
    });
    expect(
      (log.stats as { defender_fatigue_percent?: number })
        .defender_fatigue_percent,
    ).toBe(15);
  });

  test('protected and vacation defenders never gain or lose morale in battle', async () => {
    const now = Date.now();
    // Fresh (0 XP) attackers stay within the level range of fresh defenders.
    const weakAttacker = await createPlayer('Exempt weak attacker');
    const freshAttacker = await createPlayer('Exempt fresh attacker');
    const strongAttacker = await createPlayer('Exempt strong attacker');
    // A protected new player (no XP) holding a huge army: repels.
    const protectedHolder = await createPlayer('Exempt protected holder');
    // A protected new player that gets breached.
    const protectedLoser = await createPlayer('Exempt protected loser');
    // An experienced defender on vacation: gets breached.
    const vacationer = await createPlayer('Exempt vacationer');

    await setUnits(weakAttacker.id, 'OFFENSE', 50);
    await setUnits(freshAttacker.id, 'OFFENSE', 5000);
    await setUnits(strongAttacker.id, 'OFFENSE', 5000);
    await prisma.users.update({
      where: { id: strongAttacker.id },
      data: { experience: UNPROTECTED_XP },
    });

    // Protected defenders keep an explicit mid-range morale. The holder's
    // army stays small: protection ends at the population threshold, and a
    // 10:1 defense ratio still comfortably repels 50 attackers.
    await setUnits(protectedHolder.id, 'DEFENSE', 500);
    await setUnits(protectedLoser.id, 'DEFENSE', 100);
    for (const id of [protectedHolder.id, protectedLoser.id]) {
      await prisma.users.update({
        where: { id },
        data: { kingdom_morale: 50 },
      });
    }

    await prisma.users.update({
      where: { id: vacationer.id },
      data: { experience: UNPROTECTED_XP, kingdom_morale: 40 },
    });
    await setUnits(vacationer.id, 'DEFENSE', 100);
    await prisma.accountStatusHistory.create({
      data: {
        user_id: vacationer.id,
        status: 'VACATION',
        start_date: new Date(now - 4 * DAY_MS),
        reason: 'synthetic vacation',
      },
    });

    // Protected defender repels: no +2 for the win.
    const repelled = await AttackService.executeAttack(
      weakAttacker.id,
      protectedHolder.id,
      5,
    );
    expect(repelled.status).toBe('success');
    expect(
      (
        await prisma.attack_log.findFirstOrThrow({
          where: { defender_id: protectedHolder.id },
        })
      ).winner,
    ).toBe(protectedHolder.id);
    expect((await userRow(protectedHolder.id)).kingdom_morale).toBe(50);

    // Protected defender falls: no -3 for the loss.
    const protectedBreached = await AttackService.executeAttack(
      freshAttacker.id,
      protectedLoser.id,
      5,
    );
    expect(protectedBreached.status).toBe('success');
    expect(
      (
        await prisma.attack_log.findFirstOrThrow({
          where: { defender_id: protectedLoser.id },
        })
      ).winner,
    ).toBe(freshAttacker.id);
    expect((await userRow(protectedLoser.id)).kingdom_morale).toBe(50);

    // Vacation defender falls: no -3 for the loss either.
    const vacationBreached = await AttackService.executeAttack(
      strongAttacker.id,
      vacationer.id,
      5,
    );
    expect(vacationBreached.status).toBe('success');
    expect(
      (
        await prisma.attack_log.findFirstOrThrow({
          where: { defender_id: vacationer.id },
        })
      ).winner,
    ).toBe(strongAttacker.id);
    expect((await userRow(vacationer.id)).kingdom_morale).toBe(40);
  });
});

describe('daily morale drift', () => {
  test('active, passive, inactive, capped and upkeep-broken players each move by their rule', async () => {
    const now = Date.now();
    const active = await createPlayer('Daily active');
    const passive = await createPlayer('Daily passive');
    const lapsed = await createPlayer('Three day lapsed');
    const longGone = await createPlayer('Long gone');
    const broke = await createPlayer('Broke mercenary holder');
    const setup = (
      id: number,
      data: Parameters<typeof prisma.users.update>[0]['data'],
    ) => prisma.users.update({ where: { id }, data });

    await setup(active.id, {
      experience: UNPROTECTED_XP,
      last_active: new Date(now - 1 * HOUR_MS),
      kingdom_morale: 50,
    });
    await setup(passive.id, {
      experience: UNPROTECTED_XP,
      last_active: new Date(now - 30 * HOUR_MS),
      kingdom_morale: 80,
    });
    await setup(lapsed.id, {
      experience: UNPROTECTED_XP,
      last_active: new Date(now - 3 * DAY_MS),
      kingdom_morale: 100,
    });
    await setup(longGone.id, {
      experience: UNPROTECTED_XP,
      last_active: new Date(now - 17 * DAY_MS),
      kingdom_morale: 100,
    });
    await setup(broke.id, {
      experience: UNPROTECTED_XP,
      last_active: new Date(now - 1 * HOUR_MS),
      kingdom_morale: 50,
      gold: 0n,
    });
    await prisma.forceContract.create({
      data: {
        kind: 'MERCENARY',
        status: 'ACTIVE',
        userId: broke.id,
        type: 'OFFENSE',
        level: 1,
        equipment: [],
        initialQuantity: 10,
        survivingQuantity: 10,
        termDays: 3,
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 3 * DAY_MS),
        unitPriceGold: 1n,
      },
    });

    const result = await CronJobService.processDailyUpdates();
    expect(result).toMatchObject({ success: true, failed: 0 });

    expect((await userRow(active.id)).kingdom_morale).toBe(55);
    expect((await userRow(passive.id)).kingdom_morale).toBe(83);
    expect((await userRow(lapsed.id)).kingdom_morale).toBe(95);
    expect((await userRow(longGone.id)).kingdom_morale).toBe(85);
    // Active bonus plus the broke-kingdom mercenary upkeep hit: +5 - 3.
    expect((await userRow(broke.id)).kingdom_morale).toBe(52);

    const moraleLedger = async (userId: number) =>
      await prisma.bank_history.findFirstOrThrow({
        where: { to_user_id: userId, history_type: 'KINGDOM_MORALE' },
      });
    expect(await moraleLedger(active.id)).toMatchObject({
      stats: { moraleBefore: 50, moraleAfter: 55, rule: 'ACTIVE' },
    });
    expect(await moraleLedger(broke.id)).toMatchObject({
      stats: { moraleBefore: 50, moraleAfter: 52, brokeMercenaryUpkeep: true },
    });
  });

  test('protected new players and vacation accounts are exempt from decay and desertion', async () => {
    const now = Date.now();
    const fresh = await createPlayer('Protected fresh');
    const vacationer = await createPlayer('Vacationer');
    await prisma.users.update({
      where: { id: fresh.id },
      data: { last_active: new Date(now - 3 * DAY_MS) },
    });
    await prisma.users.update({
      where: { id: vacationer.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 40,
      },
    });
    await prisma.accountStatusHistory.create({
      data: {
        user_id: vacationer.id,
        status: 'VACATION',
        start_date: new Date(now - 4 * DAY_MS),
        reason: 'synthetic vacation',
      },
    });

    await CronJobService.processDailyUpdates();

    expect((await userRow(fresh.id)).kingdom_morale).toBe(100);
    expect((await userRow(vacationer.id)).kingdom_morale).toBe(40);
    expect(
      await prisma.bank_history.count({
        where: { history_type: 'KINGDOM_MORALE', to_user_id: fresh.id },
      }),
    ).toBe(0);
    expect(
      await prisma.desertionEvent.count({ where: { userId: fresh.id } }),
    ).toBe(0);
  });
});

describe('desertion', () => {
  test('with desertion switched off, morale still drifts but nobody deserts', async () => {
    await setDesertion(false);
    const now = Date.now();
    const player = await createPlayer('Steadfast kingdom');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 10,
      },
    });
    await setUnits(player.id, 'OFFENSE', 5000);
    await setUnits(player.id, 'DEFENSE', 5000);
    await setUnits(player.id, 'CITIZEN', 5000);

    for (let run = 0; run < 3; run++) {
      await CronJobService.processDailyUpdates();
      await nextDay();
    }

    const row = await userRow(player.id);
    // Inactivity decay still applies: morale is pinned at 0.
    expect(row.kingdom_morale).toBe(0);
    // But nothing deserted and no floor was recorded.
    expect(row.desertion_floor).toBeNull();
    expect(
      (await unitQuantity(player.id, 'OFFENSE')) +
        (await unitQuantity(player.id, 'DEFENSE')),
    ).toBe(10000);
    expect(
      await prisma.desertionEvent.count({ where: { userId: player.id } }),
    ).toBe(0);
  });

  test('trained units desert 1%/day but the army never falls below 75% of the floor', async () => {
    const now = Date.now();
    const player = await createPlayer('Deserting kingdom');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 3 * DAY_MS),
        kingdom_morale: 10,
      },
    });
    await setUnits(player.id, 'OFFENSE', 5000);
    await setUnits(player.id, 'DEFENSE', 5000);
    await setUnits(player.id, 'CITIZEN', 5000);

    // Decay (-5/day) keeps morale pinned at 0, so every day desertions apply.
    for (let run = 0; run < 60; run++) {
      await CronJobService.processDailyUpdates();
      await nextDay();
    }

    const row = await userRow(player.id);
    expect(row.kingdom_morale).toBe(0);
    expect(row.desertion_floor).toBe(10000);
    // The floor guarantees 75% of the recorded army: no more, no less.
    expect(
      (await unitQuantity(player.id, 'OFFENSE')) +
        (await unitQuantity(player.id, 'DEFENSE')),
    ).toBe(7500);

    const events = await prisma.desertionEvent.findMany({
      where: { userId: player.id },
    });
    // No eligible attacker existed, so every trained deserter abandoned.
    const trainedAbandoned = events
      .filter((event) => event.kind === 'ABANDON')
      .reduce((sum, event) => sum + event.quantity, 0);
    expect(trainedAbandoned).toBe(2500);
    expect(
      events.filter((event) => event.kind === 'CITIZENS').length,
    ).toBeGreaterThan(0);
    const citizensLeft = events
      .filter((event) => event.kind === 'CITIZENS')
      .reduce((sum, event) => sum + event.quantity, 0);
    // The same cron run also grants housing growth; reconcile against its ledger.
    const recruitRows = await prisma.bank_history.findMany({
      where: { to_user_id: player.id, history_type: 'DAILY_RECRUIT' },
    });
    const grantedCitizens = recruitRows.reduce(
      (sum, row) =>
        sum +
        (Number((row.stats as { newCitizens: number }).newCitizens) -
          Number((row.stats as { currentCitizens: number }).currentCitizens)),
      0,
    );
    expect(await unitQuantity(player.id, 'CITIZEN')).toBe(
      5000 + grantedCitizens - citizensLeft,
    );
  });

  test('defectors join the top attacker, capped at 1% of that army per day across all sources', async () => {
    const now = Date.now();
    const recipient = await createPlayer('Top attacker');
    const loser = await createPlayer('First defector loser');
    const loser2 = await createPlayer('Second defector loser');
    for (const player of [recipient, loser, loser2]) {
      await prisma.users.update({
        where: { id: player.id },
        data: {
          experience: UNPROTECTED_XP,
          last_active:
            player.id === recipient.id
              ? new Date(now - 1 * HOUR_MS)
              : new Date(now - 30 * HOUR_MS),
          kingdom_morale: player.id === recipient.id ? 100 : 15,
        },
      });
    }
    await setUnits(recipient.id, 'OFFENSE', 1000);
    await setUnits(recipient.id, 'DEFENSE', 1000);
    await setUnits(loser.id, 'DEFENSE', 10000);
    await setUnits(loser2.id, 'DEFENSE', 10000);
    for (const loserId of [loser.id, loser2.id]) {
      await prisma.attack_log.create({
        data: {
          timestamp: new Date(now - 1 * HOUR_MS),
          winner: recipient.id,
          type: 'attack',
          pillaged_gold: 0n,
          attacker_losses_total: 0,
          defender_losses_total: 0,
          stats: {},
          attackerPlayer: { connect: { id: recipient.id } },
          defenderPlayer: { connect: { id: loserId } },
        },
      });
    }

    const recipientCitizensBefore = await unitQuantity(recipient.id, 'CITIZEN');

    await CronJobService.processDailyUpdates();

    // 100 deserters each; 50 flagged to defect, but the recipient's daily cap
    // is 1% of their 2000-strong army: 20 join from the first loser only —
    // and they arrive as untrained citizens, so the trained army never grows.
    expect(await unitQuantity(loser.id, 'DEFENSE')).toBe(9900);
    expect(await unitQuantity(loser2.id, 'DEFENSE')).toBe(9900);
    expect(await unitQuantity(recipient.id, 'DEFENSE')).toBe(1000);
    expect(await unitQuantity(recipient.id, 'OFFENSE')).toBe(1000);
    expect(await unitQuantity(recipient.id, 'CITIZEN')).toBe(
      recipientCitizensBefore + (await citizensGranted(recipient.id)) + 20,
    );

    const defections = await prisma.desertionEvent.findMany({
      where: { kind: 'DEFECT', defectedToUserId: recipient.id },
    });
    expect(defections).toHaveLength(1);
    // The event records what the loser lost: its own Level 1 row.
    expect(defections[0]).toMatchObject({
      userId: loser.id,
      quantity: 20,
      unitType: 'DEFENSE',
      unitLevel: 1,
    });
    const abandoned = async (userId: number) =>
      (
        await prisma.desertionEvent.findMany({
          where: { userId, kind: 'ABANDON' },
        })
      ).reduce((sum, event) => sum + event.quantity, 0);
    expect(await abandoned(loser.id)).toBe(80);
    expect(await abandoned(loser2.id)).toBe(100);

    const received = await prisma.bank_history.findFirstOrThrow({
      where: { history_type: 'KINGDOM_MORALE', to_user_id: recipient.id },
    });
    expect(received.stats).toMatchObject({ defectorsReceived: 20 });
  });

  test('an allied attacker is not eligible: all deserters abandon instead', async () => {
    const now = Date.now();
    const recipient = await createPlayer('Allied attacker');
    const loser = await createPlayer('Alliance loser');
    for (const player of [recipient, loser]) {
      await prisma.users.update({
        where: { id: player.id },
        data: {
          experience: UNPROTECTED_XP,
          last_active:
            player.id === recipient.id
              ? new Date(now - 1 * HOUR_MS)
              : new Date(now - 30 * HOUR_MS),
          kingdom_morale: player.id === recipient.id ? 100 : 15,
        },
      });
    }
    await setUnits(recipient.id, 'OFFENSE', 1000);
    await setUnits(loser.id, 'DEFENSE', 10000);
    await prisma.attack_log.create({
      data: {
        timestamp: new Date(now - 1 * HOUR_MS),
        winner: recipient.id,
        type: 'attack',
        pillaged_gold: 0n,
        attacker_losses_total: 0,
        defender_losses_total: 0,
        stats: {},
        attackerPlayer: { connect: { id: recipient.id } },
        defenderPlayer: { connect: { id: loser.id } },
      },
    });
    const alliance = await prisma.alliances.create({
      data: { name: 'Morale test pact', leader_id: recipient.id },
    });
    const role = await prisma.alliance_roles.create({
      data: { name: 'Member', alliance_id: alliance.id },
    });
    for (const memberId of [recipient.id, loser.id]) {
      await prisma.alliance_memberships.create({
        data: { alliance_id: alliance.id, user_id: memberId, role_id: role.id },
      });
    }

    await CronJobService.processDailyUpdates();

    expect(
      await prisma.desertionEvent.count({
        where: { kind: 'DEFECT', defectedToUserId: recipient.id },
      }),
    ).toBe(0);
    expect(await unitQuantity(recipient.id, 'DEFENSE')).toBe(0);
    const abandoned = await prisma.desertionEvent.findMany({
      where: { userId: loser.id, kind: 'ABANDON' },
    });
    expect(abandoned.reduce((sum, event) => sum + event.quantity, 0)).toBe(100);
  });

  test('mercenary contracts lose 10% of survivors per day below the threshold', async () => {
    const now = Date.now();
    const player = await createPlayer('Mercenary deserter');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        last_active: new Date(now - 30 * HOUR_MS),
        kingdom_morale: 15,
        gold: 1_000_000n,
        fort_level: 12,
      },
    });
    await prisma.forceContract.create({
      data: {
        kind: 'MERCENARY',
        status: 'ACTIVE',
        userId: player.id,
        type: 'OFFENSE',
        level: 1,
        equipment: [],
        initialQuantity: 40,
        survivingQuantity: 40,
        termDays: 7,
        startsAt: new Date(now - DAY_MS),
        expiresAt: new Date(now + 6 * DAY_MS),
        unitPriceGold: 1n,
      },
    });

    await CronJobService.processDailyUpdates();

    expect(
      (
        await prisma.forceContract.findFirstOrThrow({
          where: { userId: player.id },
        })
      ).survivingQuantity,
    ).toBe(36);
    const mercEvents = await prisma.desertionEvent.findMany({
      where: { userId: player.id, kind: 'MERCENARY' },
    });
    expect(mercEvents).toHaveLength(1);
    expect(mercEvents[0]).toMatchObject({ quantity: 4, unitType: 'OFFENSE' });
  });
});

describe('garrison fatigue switch', () => {
  const tiredDefense = async (fatigueOn: boolean) => {
    await setRuntimeSwitch('ENABLE_GARRISON_FATIGUE', fatigueOn);
    const attacker = await createPlayer(`Raider ${fatigueOn}`);
    const defender = await createPlayer(`Tired wall ${fatigueOn}`);
    await prisma.users.update({
      where: { id: attacker.id },
      data: { experience: UNPROTECTED_XP },
    });
    // 60 pressure today: enough to bottom fatigue out at -15%.
    await prisma.users.update({
      where: { id: defender.id },
      data: {
        experience: UNPROTECTED_XP,
        defense_pressure_today: 60,
        defense_pressure_date: new Date(),
      },
    });
    await setUnits(attacker.id, 'OFFENSE', 300);
    await setUnits(defender.id, 'DEFENSE', 300);
    const outcome = await AttackService.executeAttack(
      attacker.id,
      defender.id,
      5,
    );
    expect(outcome.status).toBe('success');
    const log = await prisma.attack_log.findFirstOrThrow({
      where: { defender_id: defender.id },
    });
    return {
      fatigue: (log.stats as { defender_fatigue_percent: number })
        .defender_fatigue_percent,
      pressureAfter: (await userRow(defender.id)).defense_pressure_today,
    };
  };

  test('on (default): the tired garrison fights at -15%', async () => {
    expect((await tiredDefense(true)).fatigue).toBe(15);
  });

  test('off: no fatigue applies, but pressure is still recorded', async () => {
    const off = await tiredDefense(false);
    expect(off.fatigue).toBe(0);
    expect(off.pressureAfter).toBeGreaterThan(60);
  });
});

describe('garrison fatigue in the engine (#204)', () => {
  test('pressure tires the garrison into losing assaults but never raises casualties', async () => {
    const { simulateBattle } = await import('@/utils/attackFunctions');
    const { default: UserModel } = await import('@/models/Users');
    const { default: MockUserGenerator } =
      await import('@/utils/MockUserGenerator');

    const build = async (
      name: string,
      offense: number,
      defense: number,
    ): Promise<InstanceType<typeof UserModel>> => {
      const generator = new MockUserGenerator();
      generator.setBasicInfo({
        email: `${name.toLowerCase()}@example.test`,
        display_name: name,
        race: 'HUMAN',
        class: 'FIGHTER',
      });
      generator.clearUnits();
      generator.addUnits(
        [
          { type: 'OFFENSE', level: 1, quantity: offense },
          { type: 'DEFENSE', level: 1, quantity: defense },
        ].filter((unit) => unit.quantity > 0),
      );
      const model = new UserModel(generator.getUser());
      model.mercenaries = [];
      return model;
    };

    // Borderline matchup: 290 soldiers press 1450 against 300 guards' 1500.
    // Same seed everywhere, so every damage roll repeats exactly.
    const runAtPressure = async (pressure: number) => {
      const attacker = await build('Tired attacker', 290, 0);
      const defender = await build('Tired defender', 0, 300);
      (
        defender as unknown as { defensePressureToday: number }
      ).defensePressureToday = pressure;
      (
        defender as unknown as { defensePressureDate: string }
      ).defensePressureDate = new Date().toISOString();
      return await simulateBattle(
        attacker,
        defender,
        defender.fortHitpoints,
        10,
        false,
        false,
        {
          random: () => 0.5,
        },
      );
    };

    // Small fatigue does not change any assault outcome, so fatigue itself
    // adds no casualties. (Losses may only shrink: the pre-existing
    // pressure-based dogpile budget — deliberately untouched — scales down
    // with pressure, independently of the new fatigue multiplier.)
    const rested = await runAtPressure(0);
    const slightlyTired = await runAtPressure(4);
    expect(rested.defenderFatiguePercent).toBe(0);
    expect(slightlyTired.defenderFatiguePercent).toBe(1);
    expect(slightlyTired.result).toBe(rested.result);
    const defenderLosses = (result: typeof rested) =>
      result.Losses.Defender.total +
      (result.wounded?.defender ?? []).reduce((s, w) => s + w.quantity, 0);
    expect(defenderLosses(slightlyTired)).toBeLessThanOrEqual(
      defenderLosses(rested),
    );

    // At 60 pressure today the multiplier bottoms out at 0.85 and the tired
    // garrison loses assaults it would otherwise hold.
    const exhausted = await runAtPressure(60);
    expect(exhausted.defenderFatiguePercent).toBe(15);
    expect(rested.result).toBe('LOSS'); // the defender holds at full strength
    expect(exhausted.result).toBe('WIN'); // the fatigued garrison is breached

    // The loot gate rides the SAME fatigued contest value that decided the
    // assault: 1450 pressure breaches 1500 defense only because 0.85 tires
    // it to 1275, so the breach yields loot instead of a hollow "success".
    // (Casualty budgets stay on rested power: that contract is unchanged.)
    // The rested run still pillages from turns that beat even the rested
    // wall early in the battle — fatigue only ADDS breach turns.
    expect(exhausted.pillagedGold > 0n).toBe(true);
    expect(exhausted.pillagedGold > rested.pillagedGold).toBe(true);
  });
});

describe('mercenary hire and renew refusal below morale 20', () => {
  test('hire, renew are refused with the exact message; hire works again at 20', async () => {
    const player = await createPlayer('Demoralised captain');
    await prisma.users.update({
      where: { id: player.id },
      data: {
        experience: UNPROTECTED_XP,
        kingdom_morale: 15,
        gold: 1_000_000_000n,
        fort_level: 12,
        economy_level: 6, // Every mercenary tier unlocked (#205 phase 2)
      },
    });
    await setUnits(player.id, 'OFFENSE', 100);

    await expect(
      MercenaryService.hire({
        userId: player.id,
        type: 'OFFENSE',
        level: 1,
        quantity: 5,
        termDays: 1,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow("Mercenaries won't sign with a kingdom this demoralised");

    await prisma.users.update({
      where: { id: player.id },
      data: { kingdom_morale: 20 },
    });
    const contract = await MercenaryService.hire({
      userId: player.id,
      type: 'OFFENSE',
      level: 1,
      quantity: 5,
      termDays: 1,
      operationId: randomUUID(),
    });

    await prisma.users.update({
      where: { id: player.id },
      data: { kingdom_morale: 15 },
    });
    await expect(
      MercenaryService.change({
        userId: player.id,
        contractId: contract.id,
        termDays: 1,
        operationId: randomUUID(),
      }),
    ).rejects.toThrow("Mercenaries won't sign with a kingdom this demoralised");
    // Dismissal stays available for demoralised kingdoms.
    await expect(
      MercenaryService.change({
        userId: player.id,
        contractId: contract.id,
        operationId: randomUUID(),
      }),
    ).resolves.toMatchObject({ status: 'DISMISSED' });
  });
});
