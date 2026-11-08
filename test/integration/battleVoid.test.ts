/**
 * Integration coverage for the admin battle void (#229): a compensating,
 * audited, once-only reversal that leaves the battle log intact. Every case
 * fights a real battle through AttackService, then previews and confirms the
 * void against the real database.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';

import { ItemTypes } from '@/constants';
import { REANIMATION_FORT_LEVEL } from '@/constants/Reanimation';
import prisma from '@/lib/prisma';
import statsHandler from '@/pages/api/stats';
import { redactAttackLogForViewer } from '@/services/AttackLogAccess.service';
import { AttackService } from '@/services/AttackService';
import { BattleService } from '@/services/Battle.service';
import { loadProtectionContext } from '@/services/BattleProtection.service';
import {
  BattleVoidError,
  previewBattleVoid,
  voidBattle,
  type VoidGoldMode,
} from '@/services/BattleVoid.service';
import { CaptiveService } from '@/services/Captives.service';
import { runDiscordCommand } from '@/services/discord/DiscordCommands.service';
import { GeneralService } from '@/services/General.service';
import { getInvestigationSignals } from '@/services/InvestigationSignals.service';
import { KingdomMoraleService } from '@/services/KingdomMorale.service';
import { invalidateRuntimeConfigCache } from '@/services/RuntimeConfig.service';
import { SpyService } from '@/services/SpyService';
import { createUser } from '@/services/User.service';
import { UserDataService } from '@/services/UserDataService';
import { getHistoricalEraStats } from '@/services/UserEraStats.service';
import { recomputeStoredStatsInTx } from '@/utils/adminRecomputeStats';
import { parseCombatReplay } from '@/utils/combatReplay';
import { ForcePolicySchema } from '@/utils/temporaryForces';
import { getOTDayKey } from '@/utils/timefunctions';

import { resetDatabase, setRuntimeSwitch, setShowDungeon } from './db';
import { hireQuoted } from './hireQuoted';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Level 10 (80k XP) ends new-player protection by the LEVEL rule. */
const UNPROTECTED_XP = 80_000;
const DUNGEON_FORT = 13;

type Race = 'HUMAN' | 'UNDEAD' | 'ELF' | 'GOBLIN';

const createPlayer = (name: string, race: Race = 'HUMAN') =>
  createUser(
    `${name.toLowerCase().replace(/\s+/g, '-')}@example.test`,
    'not-a-real-hash',
    name,
    race,
    'FIGHTER',
  );

const setUnits = (
  userId: number,
  type: 'OFFENSE' | 'DEFENSE' | 'SPY' | 'SENTRY' | 'CITIZEN',
  quantity: number,
  level = 1,
) =>
  prisma.userUnit.upsert({
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

/** Everything a battle and its void can move, for one player. */
const snapshot = async (userId: number) => {
  const row = await prisma.users.findUniqueOrThrow({
    where: { id: userId },
    include: { UserUnit: true },
  });
  const units: Record<string, number> = {};
  for (const unit of row.UserUnit)
    units[`${unit.type}:${unit.level}:${unit.isMercenary}`] = unit.quantity;
  return {
    gold: row.gold,
    experience: row.experience,
    attackTurns: row.attack_turns,
    stamina: row.stamina,
    fortHitpoints: row.fort_hitpoints,
    morale: row.kingdom_morale,
    stats: row.stats,
    wounded: row.wounded_units,
    reanimatedToday: row.reanimated_today,
    sanctuaryToday: row.sanctuary_recovered_today,
    pressure: row.defense_pressure_today,
    units: Object.fromEntries(
      Object.entries(units).filter(([, quantity]) => quantity > 0),
    ),
  };
};

let adminId: number;
let eraId: number;

beforeEach(async () => {
  await resetDatabase();
  eraId = (
    await prisma.era.create({
      data: {
        name: 'Void era',
        startDate: new Date(Date.now() - 20 * DAY_MS),
      },
    })
  ).id;
  adminId = (await createPlayer('Void admin')).id;
});

/** A crushing attacker against a thin, rich defender with a ruined wall. */
const arena = async (
  options: {
    attackerRace?: Race;
    defenderRace?: Race;
    attackerFort?: number;
    defenderFort?: number;
    defenderGold?: bigint;
    defenders?: number;
    attackers?: number;
  } = {},
) => {
  const attacker = await createPlayer('Void attacker', options.attackerRace);
  const defender = await createPlayer('Void defender', options.defenderRace);
  await prisma.users.update({
    where: { id: attacker.id },
    data: {
      experience: UNPROTECTED_XP,
      fort_level: options.attackerFort ?? 1,
      gold: 1_000_000n,
    },
  });
  await prisma.users.update({
    where: { id: defender.id },
    data: {
      experience: UNPROTECTED_XP,
      fort_hitpoints: 1,
      fort_level: options.defenderFort ?? 1,
      house_level: 5,
      gold: options.defenderGold ?? 5_000_000n,
    },
  });
  await setUnits(attacker.id, 'OFFENSE', options.attackers ?? 5000);
  await setUnits(defender.id, 'DEFENSE', options.defenders ?? 500);
  await setUnits(defender.id, 'CITIZEN', 1000);
  return { attacker, defender };
};

const fight = async (attackerId: number, defenderId: number, turns = 10) => {
  const outcome = await AttackService.executeAttack(
    attackerId,
    defenderId,
    turns,
  );
  expect(outcome.status).toBe('success');
  return prisma.attack_log.findFirstOrThrow({
    where: { attacker_id: attackerId, defender_id: defenderId },
    orderBy: { id: 'desc' },
  });
};

const preview = (logId: number, mode: VoidGoldMode = 'full') =>
  previewBattleVoid(logId, mode);

const confirm = async (
  logId: number,
  mode: VoidGoldMode = 'full',
  reason = 'Exploited a rule bug',
) => {
  const plan = await preview(logId, mode);
  return voidBattle({
    logId,
    actorId: adminId,
    reason,
    goldMode: mode,
    planHash: plan.hash,
  });
};

const voidError = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(BattleVoidError);
    return error as BattleVoidError;
  }
  throw new Error('expected the void to be refused');
};

describe('full reversal of a simple battle', () => {
  test('gold, troops, fort, turns, stamina, XP, morale and counters return; the log stays intact', async () => {
    const { attacker, defender } = await arena();
    const beforeA = await snapshot(attacker.id);
    const beforeD = await snapshot(defender.id);
    const log = await fight(attacker.id, defender.id);
    const stats = log.stats as Record<string, unknown>;
    const afterA = await snapshot(attacker.id);
    const afterD = await snapshot(defender.id);
    expect(log.pillaged_gold).toBeGreaterThan(0n);
    expect(afterD.gold).toBeLessThan(beforeD.gold);
    expect(afterA.attackTurns).toBeLessThan(beforeA.attackTurns);
    expect(afterD.fortHitpoints).toBeLessThan(beforeD.fortHitpoints);
    expect(afterD.morale).toBeLessThan(beforeD.morale);
    expect(afterA.experience).toBeGreaterThan(beforeA.experience);

    const plan = await preview(log.id);
    // Preview is read-only.
    expect(await snapshot(defender.id)).toEqual(afterD);
    expect(
      plan.items.find((item) => item.kind === 'GOLD_DEFENDER')?.applied,
    ).toBe(log.pillaged_gold!.toString());

    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'Exploited a rule bug',
      goldMode: 'full',
      planHash: plan.hash,
    });

    const finalA = await snapshot(attacker.id);
    const finalD = await snapshot(defender.id);
    expect(finalA.gold).toBe(beforeA.gold);
    expect(finalD.gold).toBe(beforeD.gold);
    expect(finalA.units).toEqual(beforeA.units);
    expect(finalD.units).toEqual(beforeD.units);
    expect(finalA.wounded).toEqual([]);
    expect(finalD.wounded).toEqual([]);
    expect(finalD.fortHitpoints).toBe(beforeD.fortHitpoints);
    expect(finalA.attackTurns).toBe(beforeA.attackTurns);
    expect(finalA.experience).toBe(beforeA.experience);
    expect(finalD.experience).toBe(beforeD.experience);
    expect(finalD.morale).toBe(beforeD.morale);
    expect(finalA.stats ?? []).toEqual(beforeA.stats ?? []);
    expect(finalD.stats ?? []).toEqual(beforeD.stats ?? []);
    expect(finalA.stamina).toBe(
      Math.min(afterA.stamina + Number(stats.stamina_cost), 100_000),
    );

    // The log is untouched except for the void marker; the void is a record.
    const voided = await prisma.attack_log.findUniqueOrThrow({
      where: { id: log.id },
      include: { voidRecord: true },
    });
    expect(voided.stats).toEqual(log.stats);
    expect(voided.pillaged_gold).toBe(log.pillaged_gold);
    expect(voided.winner).toBe(log.winner);
    expect(voided.voidedAt).not.toBeNull();
    expect(voided.voidedById).toBe(adminId);
    expect(voided.voidReason).toBe('Exploited a rule bug');
    expect(voided.voidRecord?.planHash).toBe(plan.hash);
    expect(voided.voidRecord?.actorId).toBe(adminId);

    // Audit trail with full before/after values.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ADMIN_BATTLE_VOID', entityId: log.id },
    });
    const details = audit.details as Record<string, any>;
    expect(details.reason).toBe('Exploited a rule bug');
    expect(details.before.defender.gold).toBe(afterD.gold.toString());
    expect(details.after.defender.gold).toBe(beforeD.gold.toString());
    expect(details.before.attacker.attackTurns).toBe(afterA.attackTurns);
    expect(details.after.attacker.attackTurns).toBe(beforeA.attackTurns);

    // Both participants were told.
    const notices = await prisma.chatMessage.findMany({
      where: { senderId: adminId },
      include: { room: { include: { participants: true } } },
    });
    expect(
      notices.flatMap((notice) =>
        notice.room.participants
          .map((participant) => participant.userId)
          .filter((id) => id !== adminId),
      ),
    ).toEqual(expect.arrayContaining([attacker.id, defender.id]));
    expect(notices).toHaveLength(2);
    for (const notice of notices) {
      expect(notice.content).toContain(`#${log.id}`);
      expect(notice.content).toContain('Exploited a rule bug');
    }

    // Compensating bank record next to the original spoils record.
    expect(
      await prisma.bank_history.count({
        where: { history_type: 'WAR_SPOILS' },
      }),
    ).toBe(1);
    expect(
      await prisma.bank_history.count({
        where: { history_type: 'WAR_SPOILS_VOID' },
      }),
    ).toBe(1);
  });

  test('the voided battle is excluded from the pair limit but still replays and reads as history', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    await confirm(log.id);
    expect(
      await prisma.attack_log.count({
        where: { attacker_id: attacker.id, voidedAt: null },
      }),
    ).toBe(0);
    // Replay of history still works.
    const retest = await BattleService.retestBattle(log.id);
    expect(retest.exactReplay).toBe(true);
    // Participants see the marker; nothing internal leaks.
    const voided = await prisma.attack_log.findUniqueOrThrow({
      where: { id: log.id },
    });
    const report = redactAttackLogForViewer(
      { ...voided, attackerPlayer: {}, defenderPlayer: {} },
      'defender',
    ) as Record<string, any>;
    expect(report.voided.reason).toBe('Exploited a rule bug');
    expect(JSON.stringify(report)).not.toContain('voidLedger');
    expect(report.voided.byId).toBeUndefined();
  });

  test('a voided battle no longer counts against the pair limit or the defender’s daily allowance', async () => {
    await prisma.serverSetting.create({
      data: {
        key: 'combat.pairDailyLimit',
        label: 'Pair attack daily limit',
        type: 'NUMBER',
        value: 1,
        isPublic: true,
      },
    });
    invalidateRuntimeConfigCache();
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id, 1);
    const refused = await AttackService.executeAttack(
      attacker.id,
      defender.id,
      1,
    );
    expect(refused).toMatchObject({
      status: 'failed',
      code: 'TOO_MANY_ATTACKS',
    });
    await confirm(log.id);
    const again = await AttackService.executeAttack(
      attacker.id,
      defender.id,
      1,
    );
    expect(again.status).toBe('success');
  });

  test('only battles can be voided', async () => {
    const { attacker, defender } = await arena();
    const spy = await prisma.attack_log.create({
      data: {
        attacker_id: attacker.id,
        defender_id: defender.id,
        timestamp: new Date(),
        winner: attacker.id,
        type: 'INTEL',
        stats: {},
      },
    });
    expect((await voidError(preview(spy.id))).code).toBe('UNSUPPORTED_TYPE');
  });
});

describe('mercenary contracts', () => {
  const lose = async () => {
    const { attacker, defender } = await arena({
      attackers: 0,
      defenders: 4000,
    });
    await prisma.users.update({
      where: { id: attacker.id },
      data: { gold: 100_000_000n, economy_level: 6, fort_level: 12 },
    });
    await setUnits(attacker.id, 'DEFENSE', 400);
    const contract = await hireQuoted({
      userId: attacker.id,
      type: 'OFFENSE',
      level: 1,
      quantity: 50,
      termDays: 3,
      operationId: randomUUID(),
    });
    const log = await fight(attacker.id, defender.id, 5);
    const fresh = await prisma.forceContract.findUniqueOrThrow({
      where: { id: contract.id },
    });
    return { attacker, defender, contract: fresh, log };
  };

  test('killed contract troops return to their contract and a depleted one reopens', async () => {
    const { attacker, contract, log } = await lose();
    expect(contract.survivingQuantity).toBeLessThan(contract.initialQuantity);
    const killed = contract.initialQuantity - contract.survivingQuantity;
    await confirm(log.id);
    const restored = await prisma.forceContract.findUniqueOrThrow({
      where: { id: contract.id },
    });
    expect(restored.survivingQuantity).toBe(contract.initialQuantity);
    expect(restored.status).toBe('ACTIVE');
    expect(restored.closedAt).toBeNull();
    const events = await prisma.forceEvent.findMany({
      where: { contractId: contract.id, action: 'CASUALTIES_VOIDED' },
    });
    expect(events.reduce((sum, event) => sum + event.quantity, 0)).toBe(killed);
    expect(attacker.id).toBeGreaterThan(0);
  });

  test('a contract that has ended is compensated as gold at its hire price', async () => {
    const { attacker, contract, log } = await lose();
    const killed = contract.initialQuantity - contract.survivingQuantity;
    expect(contract.unitPriceGold).toBeGreaterThan(0n);
    await prisma.forceContract.update({
      where: { id: contract.id },
      data: { status: 'DISMISSED', closedAt: new Date() },
    });
    const before = await snapshot(attacker.id);
    const plan = await preview(log.id);
    expect(plan.items.some((item) => item.kind === 'CONTRACT_GOLD')).toBe(true);
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'ended contract',
      goldMode: 'full',
      planHash: plan.hash,
    });
    const after = await snapshot(attacker.id);
    expect(after.gold - before.gold).toBeGreaterThanOrEqual(
      contract.unitPriceGold * BigInt(killed),
    );
    const untouched = await prisma.forceContract.findUniqueOrThrow({
      where: { id: contract.id },
    });
    expect(untouched.survivingQuantity).toBe(contract.survivingQuantity);
  });
});

describe('post-battle effects', () => {
  test('Undead reanimation: risen units and the daily allowance are taken back', async () => {
    const { attacker, defender } = await arena({
      attackerRace: 'UNDEAD',
      attackerFort: REANIMATION_FORT_LEVEL,
    });
    const beforeA = await snapshot(attacker.id);
    const beforeD = await snapshot(defender.id);
    const log = await fight(attacker.id, defender.id);
    const afterA = await snapshot(attacker.id);
    expect(afterA.reanimatedToday).toBeGreaterThan(0);
    const ledger = (log.stats as any).voidLedger;
    expect(ledger.reanimation.attacker.length).toBeGreaterThan(0);
    await confirm(log.id);
    const finalA = await snapshot(attacker.id);
    expect(finalA.reanimatedToday).toBe(0);
    expect(finalA.units).toEqual(beforeA.units);
    expect(await snapshot(defender.id)).toMatchObject({ units: beforeD.units });
    const row = await prisma.users.findUniqueOrThrow({
      where: { id: attacker.id },
    });
    expect(row.reanimation_day).toBe(getOTDayKey());
  });

  test('risen units that died again are capped, never driving a stack negative', async () => {
    const { attacker, defender } = await arena({
      attackerRace: 'UNDEAD',
      attackerFort: REANIMATION_FORT_LEVEL,
    });
    const log = await fight(attacker.id, defender.id);
    await prisma.userUnit.updateMany({
      where: { userId: attacker.id, level: 1, type: { not: 'CITIZEN' } },
      data: { quantity: 1 },
    });
    const plan = await preview(log.id);
    const removal = plan.items.filter(
      (item) => item.kind === 'REANIMATED_REMOVE',
    );
    expect(removal.length).toBeGreaterThan(0);
    expect(removal.some((item) => item.status === 'capped')).toBe(true);
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'cap',
      goldMode: 'full',
      planHash: plan.hash,
    });
    const negatives = await prisma.userUnit.count({
      where: { userId: attacker.id, quantity: { lt: 0 } },
    });
    expect(negatives).toBe(0);
    const record = await prisma.attackLogVoid.findUniqueOrThrow({
      where: { attackLogId: log.id },
    });
    expect((record.shortfalls as unknown[]).length).toBeGreaterThan(0);
  });

  test('captives still held are released back and the units are not restored twice', async () => {
    await setShowDungeon(true);
    const { attacker, defender } = await arena({ attackerFort: DUNGEON_FORT });
    const beforeD = await snapshot(defender.id);
    const log = await fight(attacker.id, defender.id);
    expect((log.stats as any).captives_taken).toBeGreaterThan(0);
    const held = await prisma.captive.count({
      where: { captorId: attacker.id, sourceId: defender.id },
    });
    expect(held).toBeGreaterThan(0);
    await confirm(log.id);
    expect(
      await prisma.captive.count({
        where: { captorId: attacker.id, sourceId: defender.id },
      }),
    ).toBe(0);
    expect(
      await prisma.captiveEvent.count({
        where: { kind: 'RELEASED', sourceId: defender.id },
      }),
    ).toBe(held);
    expect((await snapshot(defender.id)).units).toEqual(beforeD.units);
  });

  test('captives with no recorded outcome are not returned a second time', async () => {
    await setShowDungeon(true);
    const { attacker, defender } = await arena({ attackerFort: DUNGEON_FORT });
    const beforeD = await snapshot(defender.id);
    const log = await fight(attacker.id, defender.id);
    const gone = await prisma.captive.findFirstOrThrow({
      where: { captorId: attacker.id, sourceId: defender.id },
    });
    await prisma.captive.delete({ where: { id: gone.id } });
    // The ransom paid for them already handed those troops back.
    await prisma.userUnit.update({
      where: {
        userId_type_level_isMercenary: {
          userId: defender.id,
          type: gone.unitType,
          level: gone.unitLevel,
          isMercenary: false,
        },
      },
      data: { quantity: { increment: gone.quantity } },
    });
    const plan = await preview(log.id);
    expect(
      plan.items.some(
        (item) =>
          item.kind === 'CAPTIVE_RELEASE' && item.status === 'not_reversed',
      ),
    ).toBe(true);
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'ransomed',
      goldMode: 'full',
      planHash: plan.hash,
    });
    const final = await snapshot(defender.id);
    // Every troop is back exactly once: no double restoration.
    expect(final.units).toEqual(beforeD.units);
  });

  test('alliance loan repayments taken from the pillage are reinstated and clawed from the treasury', async () => {
    const { attacker, defender } = await arena();
    const alliance = await prisma.alliances.create({
      data: {
        name: 'Loan alliance',
        leader_id: defender.id,
        gold_in_bank: 5_000n,
      },
    });
    const loan = await prisma.alliance_loans.create({
      data: {
        alliance_id: alliance.id,
        borrower_id: attacker.id,
        principal: 10_000_000n,
        interest_pct: 0,
        amount_owed: 10_000_000n,
        status: 'ACTIVE',
      },
    });
    const log = await fight(attacker.id, defender.id);
    const stats = log.stats as any;
    const repaid = BigInt(stats.goldLoanRepayment);
    expect(repaid).toBeGreaterThan(0n);
    expect(stats.voidLedger.loanRepayments[0].loanId).toBe(loan.id);
    const treasury = await prisma.alliances.findUniqueOrThrow({
      where: { id: alliance.id },
    });
    expect(treasury.gold_in_bank).toBe(5_000n + repaid);
    await confirm(log.id);
    const after = await prisma.alliance_loans.findUniqueOrThrow({
      where: { id: loan.id },
    });
    expect(after.amount_repaid).toBe(0n);
    expect(after.pending_treasury_credit).toBe(0n);
    expect(
      (await prisma.alliances.findUniqueOrThrow({ where: { id: alliance.id } }))
        .gold_in_bank,
    ).toBe(5_000n);
  });

  test('a spent alliance treasury caps the clawback and the shortfall is reported', async () => {
    const { attacker, defender } = await arena();
    const alliance = await prisma.alliances.create({
      data: { name: 'Spent alliance', leader_id: defender.id },
    });
    await prisma.alliance_loans.create({
      data: {
        alliance_id: alliance.id,
        borrower_id: attacker.id,
        principal: 10_000_000n,
        interest_pct: 0,
        amount_owed: 10_000_000n,
        status: 'ACTIVE',
      },
    });
    const log = await fight(attacker.id, defender.id);
    await prisma.alliances.update({
      where: { id: alliance.id },
      data: { gold_in_bank: 0n },
    });
    const plan = await preview(log.id);
    const item = plan.items.find((entry) => entry.kind === 'LOAN_REPAYMENT');
    expect(item?.note).toBe('treasurySpent');
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'treasury spent',
      goldMode: 'full',
      planHash: plan.hash,
    });
    const treasury = await prisma.alliances.findUniqueOrThrow({
      where: { id: alliance.id },
    });
    expect(treasury.gold_in_bank).toBe(0n);
    // The alliance keeps nothing it cannot give back: the debt stays repaid.
    expect(item?.status).toBe('capped');
    expect(item?.applied).toBe('0');
    const loan = await prisma.alliance_loans.findFirstOrThrow({
      where: { alliance_id: alliance.id },
    });
    expect(loan.amount_repaid).toBe(
      BigInt((log.stats as any).goldLoanRepayment),
    );
  });

  test('a partly spent treasury reinstates only the debt it gives back', async () => {
    const { attacker, defender } = await arena();
    const alliance = await prisma.alliances.create({
      data: { name: 'Half alliance', leader_id: defender.id },
    });
    await prisma.alliance_loans.create({
      data: {
        alliance_id: alliance.id,
        borrower_id: attacker.id,
        principal: 10_000_000n,
        interest_pct: 0,
        amount_owed: 10_000_000n,
        status: 'ACTIVE',
      },
    });
    const log = await fight(attacker.id, defender.id);
    const repaid = BigInt((log.stats as any).goldLoanRepayment);
    const keeps = repaid / 4n;
    await prisma.alliances.update({
      where: { id: alliance.id },
      data: { gold_in_bank: keeps },
    });
    await confirm(log.id);
    const loan = await prisma.alliance_loans.findFirstOrThrow({
      where: { alliance_id: alliance.id },
    });
    expect(loan.amount_repaid).toBe(repaid - keeps);
    expect(
      (await prisma.alliances.findUniqueOrThrow({ where: { id: alliance.id } }))
        .gold_in_bank,
    ).toBe(0n);
  });

  test('alliance force contributions are cancelled when pending and clawed back when banked', async () => {
    const { attacker, defender } = await arena();
    const alliance = await prisma.alliances.create({
      data: {
        name: 'Force alliance',
        leader_id: defender.id,
        gold_in_bank: 0n,
      },
    });
    const log = await fight(attacker.id, defender.id);
    // Fixture: stamp the cut the way divertForcePillageInTx records it.
    const key = randomUUID();
    const cut = 1_000n;
    await prisma.attack_log.update({
      where: { id: log.id },
      data: {
        stats: {
          ...(log.stats as object),
          forcePillageContribution: cut.toString(),
          forcePillageKey: key,
        },
      },
    });
    await prisma.users.update({
      where: { id: attacker.id },
      data: { gold: { decrement: cut } },
    });
    await prisma.forceEvent.create({
      data: {
        operationKey: `force-tax:${key}:${alliance.id}`,
        actorId: attacker.id,
        action: 'PILLAGE_SETTLED',
        gold: cut,
        details: { allianceId: alliance.id, battleId: key },
      },
    });
    await prisma.alliances.update({
      where: { id: alliance.id },
      data: { gold_in_bank: cut },
    });
    await confirm(log.id);
    expect(
      (await prisma.alliances.findUniqueOrThrow({ where: { id: alliance.id } }))
        .gold_in_bank,
    ).toBe(0n);
    expect(
      await prisma.forceEvent.count({
        where: { action: 'PILLAGE_VOIDED', allianceId: alliance.id },
      }),
    ).toBe(1);
  });

  test('experience is never removed below the start of the player’s current level', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    // 76,000 starts level 10: only 5 XP are removable above it.
    await prisma.users.update({
      where: { id: attacker.id },
      data: { experience: 76_005 },
    });
    const plan = await preview(log.id);
    const xp = plan.items.find(
      (item) => item.kind === 'XP' && item.side === 'attacker',
    );
    expect(xp?.applied).toBe('5');
    expect(xp?.status).toBe('capped');
    expect(xp?.note).toBe('levelFloor');
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'floor',
      goldMode: 'full',
      planHash: plan.hash,
    });
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: attacker.id } }))
        .experience,
    ).toBe(76_000);
  });
});

describe('players who have moved on', () => {
  test('gold the attacker already spent is capped, reported, and the defender policy decides the credit', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    await prisma.users.update({
      where: { id: attacker.id },
      data: { gold: 0n },
    });
    const fullPlan = await preview(log.id, 'full');
    const claw = fullPlan.items.find((item) => item.kind === 'GOLD_ATTACKER');
    expect(claw?.applied).toBe('0');
    expect(claw?.status).toBe('capped');
    expect(
      fullPlan.items.find((item) => item.kind === 'GOLD_DEFENDER')?.applied,
    ).toBe(log.pillaged_gold!.toString());
    const recoveredPlan = await preview(log.id, 'recovered');
    expect(
      recoveredPlan.items.find((item) => item.kind === 'GOLD_DEFENDER')
        ?.applied,
    ).toBe('0');

    const before = await snapshot(defender.id);
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'spent',
      goldMode: 'recovered',
      planHash: recoveredPlan.hash,
    });
    // Nothing negative anywhere; the defender got no gold that did not exist.
    expect((await snapshot(attacker.id)).gold).toBe(0n);
    expect((await snapshot(defender.id)).gold).toBe(before.gold);
    const record = await prisma.attackLogVoid.findUniqueOrThrow({
      where: { attackLogId: log.id },
    });
    expect(JSON.stringify(record.shortfalls)).toContain('GOLD_ATTACKER');
    expect(record.goldMode).toBe('recovered');
  });

  test('a changed player invalidates the previewed plan', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    const plan = await preview(log.id);
    await prisma.users.update({
      where: { id: attacker.id },
      data: { gold: 1n },
    });
    const error = await voidError(
      voidBattle({
        logId: log.id,
        actorId: adminId,
        reason: 'stale',
        goldMode: 'full',
        planHash: plan.hash,
      }),
    );
    expect(error.status).toBe(409);
    expect(error.code).toBe('STALE_PLAN');
    expect(
      (await prisma.attack_log.findUniqueOrThrow({ where: { id: log.id } }))
        .voidedAt,
    ).toBeNull();
    expect(await prisma.attackLogVoid.count()).toBe(0);
  });
});

describe('once only', () => {
  test('a second void is refused with 409 and changes nothing', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    await confirm(log.id);
    const settledA = await snapshot(attacker.id);
    const settledD = await snapshot(defender.id);
    const error = await voidError(confirm(log.id));
    expect(error.status).toBe(409);
    expect(error.code).toBe('ALREADY_VOIDED');
    expect(await snapshot(attacker.id)).toEqual(settledA);
    expect(await snapshot(defender.id)).toEqual(settledD);
    expect(await prisma.attackLogVoid.count()).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { action: 'ADMIN_BATTLE_VOID' } }),
    ).toBe(1);
  });

  test('the database itself refuses a second void record for one battle', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    await confirm(log.id);
    await expect(
      (async () =>
        prisma.attackLogVoid.create({
          data: {
            attackLogId: log.id,
            battleId: log.id,
            actorId: adminId,
            reason: 'again',
            planHash: 'x'.repeat(64),
            goldMode: 'full',
            ledger: {},
            shortfalls: [],
            notReversed: [],
          },
        }))(),
    ).rejects.toThrow();
  });

  test('concurrent voids: exactly one wins and the other gets 409', async () => {
    const { attacker, defender } = await arena();
    const beforeD = await snapshot(defender.id);
    const log = await fight(attacker.id, defender.id);
    const afterFight = await snapshot(defender.id);
    const plan = await preview(log.id);
    const attempt = () =>
      voidBattle({
        logId: log.id,
        actorId: adminId,
        reason: 'race',
        goldMode: 'full',
        planHash: plan.hash,
      });
    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(2);
    for (const result of lost) {
      expect(result.reason).toBeInstanceOf(BattleVoidError);
      expect(result.reason.status).toBe(409);
    }
    expect(await prisma.attackLogVoid.count()).toBe(1);
    // Compensated once, not twice.
    const finalD = await snapshot(defender.id);
    expect(finalD.gold).toBe(beforeD.gold);
    expect(afterFight.gold).toBeLessThan(finalD.gold);
    expect(
      await prisma.chatMessage.count({ where: { senderId: adminId } }),
    ).toBe(2);
  });

  test('a reason is required', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    const plan = await preview(log.id);
    const error = await voidError(
      voidBattle({
        logId: log.id,
        actorId: adminId,
        reason: '   ',
        goldMode: 'full',
        planHash: plan.hash,
      }),
    );
    expect(error.code).toBe('REASON_REQUIRED');
    expect(eraId).toBeGreaterThan(0);
  });
});

/** A losing attacker with `quantity` hired mercenaries against a thick defense. */
const loseWithContract = async (quantity = 100) => {
  const { attacker, defender } = await arena({
    attackers: 0,
    defenders: 4000,
  });
  await prisma.users.update({
    where: { id: attacker.id },
    data: { gold: 100_000_000n, economy_level: 6, fort_level: 12 },
  });
  await setUnits(attacker.id, 'DEFENSE', 400);
  const contract = await hireQuoted({
    userId: attacker.id,
    type: 'OFFENSE',
    level: 1,
    quantity,
    termDays: 3,
    operationId: randomUUID(),
  });
  const log = await fight(attacker.id, defender.id, 5);
  const fresh = await prisma.forceContract.findUniqueOrThrow({
    where: { id: contract.id },
  });
  return { attacker, defender, contract: fresh, log };
};

const activeRoleTotal = async (userId: number, type = 'OFFENSE') =>
  (
    await prisma.forceContract.aggregate({
      where: {
        userId,
        kind: 'MERCENARY',
        type: type as never,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      _sum: { survivingQuantity: true },
    })
  )._sum.survivingQuantity ?? 0;

describe('restoration never exceeds today’s hiring and borrowing limits (review S1)', () => {
  test('hiring a replacement fills the role, so the lost troops are paid as gold, not restored', async () => {
    const { attacker, contract, log } = await loseWithContract(100);
    const killed = contract.initialQuantity - contract.survivingQuantity;
    expect(killed).toBeGreaterThan(0);
    await hireQuoted({
      userId: attacker.id,
      type: 'OFFENSE',
      level: 1,
      quantity: killed,
      termDays: 3,
      operationId: randomUUID(),
    });
    expect(await activeRoleTotal(attacker.id)).toBe(100);
    const before = await snapshot(attacker.id);
    const plan = await preview(log.id);
    const restore = plan.items.find((item) => item.kind === 'CONTRACT_RESTORE');
    expect(restore?.applied).toBe('0');
    const gold = plan.items.find((item) => item.kind === 'CONTRACT_GOLD');
    expect(gold?.note).toBe('contractCapGold');
    expect(gold?.applied).toBe(String(killed));
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'cap',
      goldMode: 'full',
      planHash: plan.hash,
    });
    // Never 150 in the role: the cap of 100 holds.
    expect(await activeRoleTotal(attacker.id)).toBe(100);
    const fresh = await prisma.forceContract.findUniqueOrThrow({
      where: { id: contract.id },
    });
    expect(fresh.survivingQuantity).toBe(contract.survivingQuantity);
    const after = await snapshot(attacker.id);
    expect(after.gold - before.gold).toBe(
      contract.unitPriceGold * BigInt(killed),
    );
  });

  test('the army-share limit is checked against the trained army as restored', async () => {
    const { attacker, contract, log } = await loseWithContract(100);
    const killed = contract.initialQuantity - contract.survivingQuantity;
    await prisma.userUnit.updateMany({
      where: { userId: attacker.id, isMercenary: false },
      data: { quantity: 0 },
    });
    const plan = await preview(log.id);
    expect(
      plan.items.find((item) => item.kind === 'CONTRACT_RESTORE')?.applied,
    ).toBe('0');
    expect(
      plan.items.find((item) => item.kind === 'CONTRACT_GOLD')?.applied,
    ).toBe(String(killed));
  });

  test('two contracts share one role’s remaining room instead of each taking all of it', async () => {
    const { attacker, defender, contract, log } = await loseWithContract(100);
    expect(contract.survivingQuantity).toBeLessThan(100);
    // Room for exactly one troop in the role: hire the rest of the role but one.
    const second = 100 - contract.survivingQuantity - 1;
    if (second > 0)
      await hireQuoted({
        userId: attacker.id,
        type: 'OFFENSE',
        level: 1,
        quantity: second,
        termDays: 3,
        operationId: randomUUID(),
      });
    const plan = await preview(log.id);
    expect(
      plan.items.find((item) => item.kind === 'CONTRACT_RESTORE')?.applied,
    ).toBe(
      second > 0
        ? '1'
        : String(
            Math.min(1, contract.initialQuantity - contract.survivingQuantity),
          ),
    );
    expect(defender.id).toBeGreaterThan(0);
  });

  test('alliance troops stop at the borrower’s current allowance and the excess is reported', async () => {
    const { attacker, defender } = await arena({
      attackers: 0,
      defenders: 4000,
    });
    await prisma.users.update({
      where: { id: attacker.id },
      data: { gold: 100_000_000n, economy_level: 6, fort_level: 12 },
    });
    await setUnits(attacker.id, 'DEFENSE', 400);
    const leader = await createPlayer('Void lender');
    const alliance = await prisma.alliances.create({
      data: {
        name: 'Lending alliance',
        leader_id: leader.id,
        alliance_roles: { create: { name: 'Member' } },
      },
      include: { alliance_roles: true },
    });
    const roleId = alliance.alliance_roles[0]!.id;
    await prisma.alliance_memberships.create({
      data: { alliance_id: alliance.id, user_id: attacker.id, role_id: roleId },
    });
    const reserve = await prisma.forceReserve.create({
      data: {
        allianceId: alliance.id,
        type: 'OFFENSE',
        level: 1,
        loadoutKey: 'void-test',
        equipment: [],
      },
    });
    const policySettings = (maxBorrowed: number) =>
      ForcePolicySchema.parse({
        roleAllowances: [
          {
            roleId,
            maxBorrowed,
            maxTermDays: 3,
            pillageRateBps: 0,
            loanRateBps: 0,
          },
        ],
      });
    await prisma.allianceForcePolicy.create({
      data: {
        allianceId: alliance.id,
        version: 1,
        settings: policySettings(100) as never,
      },
    });
    const hired = await hireQuoted({
      userId: attacker.id,
      type: 'OFFENSE',
      level: 1,
      quantity: 100,
      termDays: 3,
      operationId: randomUUID(),
    });
    await prisma.forceContract.update({
      where: { id: hired.id },
      data: {
        kind: 'ALLIANCE',
        allianceId: alliance.id,
        reserveId: reserve.id,
        policyVersion: 1,
      },
    });
    const log = await fight(attacker.id, defender.id, 5);
    const contract = await prisma.forceContract.findUniqueOrThrow({
      where: { id: hired.id },
    });
    const killed = contract.initialQuantity - contract.survivingQuantity;
    expect(killed).toBeGreaterThan(0);
    // The leader has since cut the allowance to what is still borrowed.
    await prisma.allianceForcePolicy.create({
      data: {
        allianceId: alliance.id,
        version: 2,
        settings: policySettings(contract.survivingQuantity) as never,
      },
    });
    const plan = await preview(log.id);
    expect(
      plan.items.find(
        (item) => item.kind === 'CONTRACT_RESTORE' && item.status === 'capped',
      )?.applied,
    ).toBe('0');
    expect(
      plan.items.some(
        (item) =>
          item.kind === 'CONTRACT_RESTORE' &&
          item.note === 'contractCapAlliance',
      ),
    ).toBe(true);
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'allowance',
      goldMode: 'full',
      planHash: plan.hash,
    });
    expect(
      (
        await prisma.forceContract.findUniqueOrThrow({
          where: { id: hired.id },
        })
      ).survivingQuantity,
    ).toBe(contract.survivingQuantity);
  });
});

describe('a confirm applies exactly the previewed items (review S2, N5)', () => {
  /** Changes that do not alter any amount the plan derived. */
  const harmless: Array<[string, (a: number, d: number) => Promise<unknown>]> =
    [
      [
        'the attacker spends attack turns',
        (a) =>
          prisma.users.update({
            where: { id: a },
            data: { attack_turns: { decrement: 1 } },
          }),
      ],
      [
        'a roster row the plan does not touch changes',
        (a) =>
          prisma.userUnit.upsert({
            where: {
              userId_type_level_isMercenary: {
                userId: a,
                type: 'SPY',
                level: 1,
                isMercenary: false,
              },
            },
            create: { userId: a, type: 'SPY', level: 1, quantity: 5 },
            update: { quantity: { increment: 5 } },
          }),
      ],
      [
        'the attacker gains gold above the clawback amount',
        (a) =>
          prisma.users.update({
            where: { id: a },
            data: { gold: { increment: 7 } },
          }),
      ],
      [
        'the defender’s units change',
        (_a, d) =>
          prisma.userUnit.updateMany({
            where: { userId: d, type: 'DEFENSE', level: 1 },
            data: { quantity: { increment: 3 } },
          }),
      ],
    ];
  test.each(harmless)('still succeeds when %s', async (_name, change) => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    const plan = await preview(log.id);
    await change(attacker.id, defender.id);
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'busy server',
      goldMode: 'full',
      planHash: plan.hash,
    });
    const record = await prisma.attackLogVoid.findUniqueOrThrow({
      where: { attackLogId: log.id },
    });
    // Exactly the items the admin saw, nothing else.
    expect((record.ledger as { items: unknown }).items).toEqual(
      JSON.parse(JSON.stringify(plan.items)),
    );
  });

  test('still succeeds when the alliance treasury grows beyond the clawback', async () => {
    const { attacker, defender } = await arena();
    const alliance = await prisma.alliances.create({
      data: {
        name: 'Busy alliance',
        leader_id: defender.id,
        gold_in_bank: 5_000n,
      },
    });
    await prisma.alliance_loans.create({
      data: {
        alliance_id: alliance.id,
        borrower_id: attacker.id,
        principal: 10_000_000n,
        interest_pct: 0,
        amount_owed: 10_000_000n,
        status: 'ACTIVE',
      },
    });
    const log = await fight(attacker.id, defender.id);
    const plan = await preview(log.id);
    await prisma.alliances.update({
      where: { id: alliance.id },
      data: { gold_in_bank: { increment: 1_000n } },
    });
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'busy treasury',
      goldMode: 'full',
      planHash: plan.hash,
    });
    expect(
      (
        await prisma.attackLogVoid.findUniqueOrThrow({
          where: { attackLogId: log.id },
        })
      ).planHash,
    ).toBe(plan.hash);
  });

  test('refuses when the treasury can no longer give back the previewed amount', async () => {
    const { attacker, defender } = await arena();
    const alliance = await prisma.alliances.create({
      data: { name: 'Stale alliance', leader_id: defender.id },
    });
    await prisma.alliance_loans.create({
      data: {
        alliance_id: alliance.id,
        borrower_id: attacker.id,
        principal: 10_000_000n,
        interest_pct: 0,
        amount_owed: 10_000_000n,
        status: 'ACTIVE',
      },
    });
    const log = await fight(attacker.id, defender.id);
    const plan = await preview(log.id);
    await prisma.alliances.update({
      where: { id: alliance.id },
      data: { gold_in_bank: 0n },
    });
    expect(
      (
        await voidError(
          voidBattle({
            logId: log.id,
            actorId: adminId,
            reason: 'stale',
            goldMode: 'full',
            planHash: plan.hash,
          }),
        )
      ).code,
    ).toBe('STALE_PLAN');
  });

  test('refuses when the attacker spends gold so the clawback would shrink', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    const plan = await preview(log.id);
    await prisma.users.update({
      where: { id: attacker.id },
      data: { gold: 1n, gold_in_bank: 0n },
    });
    expect(
      (
        await voidError(
          voidBattle({
            logId: log.id,
            actorId: adminId,
            reason: 'stale',
            goldMode: 'full',
            planHash: plan.hash,
          }),
        )
      ).code,
    ).toBe('STALE_PLAN');
    expect(
      (await prisma.attack_log.findUniqueOrThrow({ where: { id: log.id } }))
        .voidedAt,
    ).toBeNull();
  });

  test('refuses when a contract changes after the preview', async () => {
    const { contract, log } = await loseWithContract(100);
    const plan = await preview(log.id);
    await prisma.forceContract.update({
      where: { id: contract.id },
      data: { pillageRateBps: 5 },
    });
    expect(
      (
        await voidError(
          voidBattle({
            logId: log.id,
            actorId: adminId,
            reason: 'stale',
            goldMode: 'full',
            planHash: plan.hash,
          }),
        )
      ).code,
    ).toBe('STALE_PLAN');
  });
});

describe('voided battles leave rankings and effective counts (review S3-S5)', () => {
  test('the historical recruiters board still returns rows, and attack boards drop the voided battle', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    await prisma.recruit_history.create({
      data: {
        from_user: defender.id,
        to_user: attacker.id,
        ip_addr: '192.0.2.1',
        timestamp: new Date(),
      },
    });
    const closeEra = () =>
      prisma.era.update({
        where: { id: eraId },
        data: { endDate: new Date(Date.now() + 3_600_000) },
      });
    const reopenEra = () =>
      prisma.era.update({ where: { id: eraId }, data: { endDate: null } });
    await closeEra();
    const before = await getHistoricalEraStats(eraId);
    await reopenEra();
    expect(before?.recruits).toHaveLength(1);
    expect(before?.attacks.map((row) => row.id)).toContain(attacker.id);
    await confirm(log.id);
    await closeEra();
    const after = await getHistoricalEraStats(eraId);
    expect(after?.recruits).toHaveLength(1);
    expect(after?.attacks.map((row) => row.id)).not.toContain(attacker.id);
    expect(after?.attackerCas.map((row) => row.id)).not.toContain(attacker.id);
    expect(after?.defenderCas.map((row) => row.id)).not.toContain(defender.id);
  });

  test('assassination’s shared daily casualty allowance gets the voided losses back', async () => {
    await setRuntimeSwitch('ENABLE_ASSASSINATIONS', true);
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    const remainingAtBattle = parseCombatReplay(
      (log.stats as { replay: unknown }).replay,
    ).defenderDailyCasualtyRemaining as number;
    const assassin = await createPlayer('Void assassin');
    await prisma.users.update({
      where: { id: assassin.id },
      data: { experience: UNPROTECTED_XP, attack_turns: 50, fort_level: 12 },
    });
    await setUnits(assassin.id, 'SPY', 200, 3);
    await setUnits(assassin.id, 'SPY', 200, 1);
    await prisma.userStructureUpgrade.upsert({
      where: { userId_type: { userId: assassin.id, type: 'SPY' } },
      create: { userId: assassin.id, type: 'SPY', level: 16 },
      update: { level: 16 },
    });
    // Spy strength comes from equipment: give every assassin a full kit.
    for (const item of ItemTypes.filter(
      (entry) => entry.usage === 'SPY' && entry.level <= 3,
    ))
      await prisma.userItem.create({
        data: {
          userId: assassin.id,
          type: item.type,
          level: item.level,
          usage: 'SPY',
          quantity: 200,
        },
      });
    await prisma.$transaction((tx) =>
      recomputeStoredStatsInTx(tx, assassin.id),
    );
    const mission = async () => {
      const result = await SpyService.executeSpyMission(
        assassin.id,
        defender.id,
        1,
        'ASSASSINATE',
        'DEFENSE',
      );
      expect(result).toMatchObject({ status: 'success' });
      const spyLog = await prisma.attack_log.findFirstOrThrow({
        where: { attacker_id: assassin.id, type: 'ASSASSINATE' },
        orderBy: { id: 'desc' },
      });
      return parseCombatReplay((spyLog.stats as { replay: unknown }).replay)
        .defenderDailyCasualtyRemaining as number;
    };
    await confirm(log.id);
    // With the battle voided, the day's allowance is whole again.
    expect(await mission()).toBe(remainingAtBattle);
  });

  test('player and public battle counts, digests and the defector search skip a voided battle', async () => {
    const { attacker, defender } = await arena();
    await prisma.users.update({
      where: { id: attacker.id },
      data: { last_active: new Date(), currentEraId: eraId },
    });
    const log = await fight(attacker.id, defender.id);
    const counts = async () => ({
      stats: await (UserDataService as any).getAttackStats(defender.id, null),
      discord: await runDiscordCommand('stats', {
        locale: 'en',
        discordUserId: '1',
      } as never),
    });
    const recipientOf = () =>
      prisma.$transaction(async (tx) =>
        (KingdomMoraleService as any).findDefectorRecipient(
          tx,
          defender.id,
          await loadProtectionContext(tx),
          new Date(),
        ),
      );
    const before = await counts();
    expect(before.stats.totalDefends).toBe(1);
    expect(before.stats.beenAttacked).toBe(true);
    // Before the void the attacker is the defender's top-attacker defector recipient.
    expect(await recipientOf()).toEqual({ id: attacker.id });
    await confirm(log.id);
    const after = await counts();
    expect(after.stats.totalDefends).toBe(0);
    expect(after.stats.wonAttacks).toBe(0);
    expect(after.stats.beenAttacked).toBe(false);
    expect(after.discord).not.toBe(before.discord);
    expect(await recipientOf()).toBeNull();
  });

  test('the player data and the public stats count only battles that stand', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    const publicBattles = async () => {
      let body: any;
      const res: any = {
        setHeader: () => res,
        status: () => res,
        json: (value: unknown) => {
          body = value;
          return res;
        },
        end: () => res,
      };
      await statsHandler({ method: 'GET' } as never, res);
      return body.battles as number;
    };
    const playerData = async () =>
      (await GeneralService.getUserData(defender.id)) as any;
    expect(await publicBattles()).toBe(1);
    expect((await playerData()).totalDefends).toBe(1);
    await confirm(log.id);
    expect(await publicBattles()).toBe(0);
    expect((await playerData()).totalDefends).toBe(0);
    expect((await playerData()).beenAttacked).toBe(false);
  });

  test('farming signals do not count a voided battle', async () => {
    const { attacker, defender } = await arena();
    const rows = Array.from({ length: 8 }, () => ({
      attacker_id: attacker.id,
      defender_id: defender.id,
      timestamp: new Date(),
      winner: attacker.id,
      type: 'attack',
      stats: {},
      pillaged_gold: 1_000n,
      attacker_losses_total: 1,
      defender_losses_total: 100,
    }));
    await prisma.attack_log.createMany({ data: rows });
    const farming = async () =>
      (await getInvestigationSignals(7)).findings.filter(
        (finding) => finding.type === 'ATTACK_FARMING',
      );
    expect(await farming()).toHaveLength(1);
    await prisma.attack_log.updateMany({
      where: { attacker_id: attacker.id },
      data: { voidedAt: new Date() },
    });
    expect(await farming()).toHaveLength(0);
  });
});

describe('the acting administrator fought in the battle (review S6)', () => {
  test('the void succeeds, notifies the other player, and touches no unrelated conversation', async () => {
    const { attacker, defender } = await arena();
    adminId = attacker.id;
    const bystander = await createPlayer('Void bystander');
    const room = await prisma.chatRoom.create({
      data: {
        createdById: adminId,
        isPrivate: true,
        participants: {
          create: [{ userId: adminId }, { userId: bystander.id }],
        },
      },
    });
    const log = await fight(attacker.id, defender.id);
    await confirm(log.id);
    expect(await prisma.chatMessage.count({ where: { roomId: room.id } })).toBe(
      0,
    );
    const notices = await prisma.chatMessage.findMany({
      include: { room: { include: { participants: true } } },
    });
    expect(notices).toHaveLength(1);
    expect(
      notices[0]!.room.participants
        .map((participant) => participant.userId)
        .sort(),
    ).toEqual([attacker.id, defender.id].sort());
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ADMIN_BATTLE_VOID' },
    });
    expect((audit.details as any).notices).toEqual(
      expect.arrayContaining([{ userId: attacker.id, delivery: 'self' }]),
    );
  });
});

describe('the audit record snapshots every entity the void touches (review S7)', () => {
  test('alliances, loans, contracts, captives, counters and the reanimation allowance appear before and after', async () => {
    await setShowDungeon(true);
    const { attacker, defender } = await arena({ attackerFort: DUNGEON_FORT });
    const alliance = await prisma.alliances.create({
      data: {
        name: 'Audit alliance',
        leader_id: defender.id,
        gold_in_bank: 5_000n,
      },
    });
    const loan = await prisma.alliance_loans.create({
      data: {
        alliance_id: alliance.id,
        borrower_id: attacker.id,
        principal: 10_000_000n,
        interest_pct: 0,
        amount_owed: 10_000_000n,
        status: 'ACTIVE',
      },
    });
    const log = await fight(attacker.id, defender.id);
    const repaid = BigInt((log.stats as any).goldLoanRepayment);
    await confirm(log.id);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ADMIN_BATTLE_VOID' },
    });
    const { before, after } = audit.details as any;
    for (const snapshotKey of [before, after]) {
      for (const key of ['alliances', 'loans', 'captives', 'forceEvents'])
        expect(snapshotKey).toHaveProperty(key);
      for (const side of ['attacker', 'defender']) {
        for (const key of [
          'winLossCounters',
          'reanimation',
          'sanctuary',
          'contracts',
          'units',
          'woundedUnits',
        ])
          expect(snapshotKey[side]).toHaveProperty(key);
      }
    }
    expect(before.alliances[0].gold_in_bank).toBe((5_000n + repaid).toString());
    expect(after.alliances[0].gold_in_bank).toBe('5000');
    expect(before.loans[0]).toMatchObject({
      id: loan.id,
      amount_repaid: repaid.toString(),
    });
    expect(after.loans[0]).toMatchObject({ id: loan.id, amount_repaid: '0' });
    expect(before.captives.length).toBeGreaterThan(0);
    expect(after.captives).toHaveLength(0);
    expect(before.attacker.winLossCounters).toEqual([
      { stat: 1, type: 'OFFENSE', subtype: 'WON' },
    ]);
    expect(after.attacker.winLossCounters).toEqual([]);
  });
});

describe('review round 2', () => {
  test('N1: loot the attacker banked is taken back after the hand, so full mode creates no gold', async () => {
    const { attacker, defender } = await arena();
    const before = await snapshot(attacker.id);
    const log = await fight(attacker.id, defender.id);
    // Bank everything straight after the attack.
    const row = await prisma.users.findUniqueOrThrow({
      where: { id: attacker.id },
    });
    await prisma.users.update({
      where: { id: attacker.id },
      data: { gold: 0n, gold_in_bank: row.gold_in_bank + row.gold },
    });
    const plan = await preview(log.id);
    const claw = plan.items.find((item) => item.kind === 'GOLD_ATTACKER');
    expect(claw?.applied).toBe(log.pillaged_gold!.toString());
    expect(claw?.status).toBe('reverse');
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'banked',
      goldMode: 'full',
      planHash: plan.hash,
    });
    const after = await prisma.users.findUniqueOrThrow({
      where: { id: attacker.id },
    });
    expect(after.gold + after.gold_in_bank).toBe(before.gold);
    expect(after.gold_in_bank).toBe(
      row.gold_in_bank + row.gold - log.pillaged_gold!,
    );
  });

  test('N1: part of the loot in hand and part banked is taken from both, hand first', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    const pillage = log.pillaged_gold!;
    const row = await prisma.users.findUniqueOrThrow({
      where: { id: attacker.id },
    });
    // Leave only a quarter of the loot in hand; the rest is banked.
    const hand = pillage / 4n;
    await prisma.users.update({
      where: { id: attacker.id },
      data: { gold: hand, gold_in_bank: row.gold_in_bank + row.gold - hand },
    });
    const plan = await preview(log.id);
    const claw = plan.items.find((item) => item.kind === 'GOLD_ATTACKER');
    expect(claw?.payload).toMatchObject({
      hand: hand.toString(),
      bank: (pillage - hand).toString(),
    });
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'split',
      goldMode: 'full',
      planHash: plan.hash,
    });
    expect(
      (await prisma.users.findUniqueOrThrow({ where: { id: attacker.id } }))
        .gold,
    ).toBe(0n);
  });

  test('N3: a battle from an earlier era is refused, in preview and confirm', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    await prisma.era.updateMany({
      where: { endDate: null },
      data: { endDate: new Date() },
    });
    const next = await prisma.era.create({
      data: { name: 'Next era', startDate: new Date(Date.now() + 1000) },
    });
    await prisma.users.updateMany({ data: { currentEraId: next.id } });
    const error = await voidError(preview(log.id));
    expect(error.status).toBe(422);
    expect(error.code).toBe('PREVIOUS_ERA');
    expect(
      (
        await voidError(
          voidBattle({
            logId: log.id,
            actorId: adminId,
            reason: 'old',
            goldMode: 'full',
            planHash: 'a'.repeat(64),
          }),
        )
      ).code,
    ).toBe('PREVIOUS_ERA');
    expect(await prisma.attackLogVoid.count()).toBe(0);
  });

  test('N3: a player who has since moved to another era blocks the void', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    const other = await prisma.era.create({
      data: { name: 'Elsewhere', startDate: new Date(Date.now() - DAY_MS) },
    });
    await prisma.users.update({
      where: { id: defender.id },
      data: { currentEraId: other.id },
    });
    expect((await voidError(preview(log.id))).code).toBe('PREVIOUS_ERA');
  });

  describe('N4: captives already dealt with are undone for what they moved', () => {
    const setup = async () => {
      await setShowDungeon(true);
      const { attacker, defender } = await arena({
        attackerFort: DUNGEON_FORT,
      });
      const beforeA = await snapshot(attacker.id);
      const beforeD = await snapshot(defender.id);
      const log = await fight(attacker.id, defender.id);
      const captive = await prisma.captive.findFirstOrThrow({
        where: { captorId: attacker.id, sourceId: defender.id },
      });
      return { attacker, defender, beforeA, beforeD, log, captive };
    };

    test('a ransom is clawed back from the captor’s share and refunded to the defender', async () => {
      const { attacker, defender, beforeA, beforeD, log, captive } =
        await setup();
      await CaptiveService.ransom({
        userId: defender.id,
        captiveId: captive.id,
        operationId: randomUUID(),
      });
      const plan = await preview(log.id);
      const claw = plan.items.find(
        (item) => item.kind === 'CAPTIVE_RANSOM_CLAW',
      );
      const refund = plan.items.find(
        (item) => item.kind === 'CAPTIVE_RANSOM_REFUND',
      );
      expect(claw).toBeDefined();
      expect(refund?.applied).toBe(refund?.recorded);
      await voidBattle({
        logId: log.id,
        actorId: adminId,
        reason: 'ransomed',
        goldMode: 'full',
        planHash: plan.hash,
      });
      const finalD = await snapshot(defender.id);
      // Pillage and ransom both refunded; every troop back exactly once.
      expect(finalD.gold).toBe(beforeD.gold);
      expect(finalD.units).toEqual(beforeD.units);
      // The captor holds neither the loot nor the ransom share.
      expect((await snapshot(attacker.id)).gold).toBe(beforeA.gold);
    });

    test('a ransom the captor can no longer repay is capped and reported', async () => {
      const { attacker, defender, log, captive } = await setup();
      await CaptiveService.ransom({
        userId: defender.id,
        captiveId: captive.id,
        operationId: randomUUID(),
      });
      await prisma.users.update({
        where: { id: attacker.id },
        data: { gold: 0n, gold_in_bank: 0n },
      });
      const plan = await preview(log.id, 'recovered');
      const claw = plan.items.find(
        (item) => item.kind === 'CAPTIVE_RANSOM_CLAW',
      );
      expect(claw?.status).toBe('capped');
      expect(claw?.applied).toBe('0');
      await voidBattle({
        logId: log.id,
        actorId: adminId,
        reason: 'spent ransom',
        goldMode: 'recovered',
        planHash: plan.hash,
      });
      const row = await prisma.users.findUniqueOrThrow({
        where: { id: attacker.id },
      });
      expect(row.gold).toBe(0n);
      expect(row.gold_in_bank).toBe(0n);
    });

    test('converted troops are taken back from the captor and restored to the defender', async () => {
      const { attacker, defender, beforeA, beforeD, log, captive } =
        await setup();
      await CaptiveService.convert(
        {
          userId: attacker.id,
          captiveId: captive.id,
          operationId: randomUUID(),
        },
        new Date(Date.now() + 100 * 3_600_000),
      );
      const plan = await preview(log.id);
      const removal = plan.items.find(
        (item) => item.kind === 'CAPTIVE_CONVERTED_REMOVE',
      );
      expect(removal?.applied).toBe(String(captive.quantity));
      await voidBattle({
        logId: log.id,
        actorId: adminId,
        reason: 'converted',
        goldMode: 'full',
        planHash: plan.hash,
      });
      expect((await snapshot(defender.id)).units).toEqual(beforeD.units);
      expect((await snapshot(attacker.id)).units).toEqual(beforeA.units);
    });

    test('escaped captives: their troops come back and the citizens they became are removed', async () => {
      const { defender, beforeD, log } = await setup();
      const { escaped } = await CaptiveService.processDailyCaptives(
        new Date(Date.now() + 60 * DAY_MS),
      );
      expect(escaped).toBeGreaterThan(0);
      const plan = await preview(log.id);
      expect(
        plan.items.some((item) => item.kind === 'CAPTIVE_ESCAPED_CITIZENS'),
      ).toBe(true);
      await voidBattle({
        logId: log.id,
        actorId: adminId,
        reason: 'escaped',
        goldMode: 'full',
        planHash: plan.hash,
      });
      expect((await snapshot(defender.id)).units).toEqual(beforeD.units);
    });
  });

  test('N6: stamina room is measured on recovered stamina, not the stale stored value', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    // Stored low, but days of recovery have refilled it.
    await prisma.users.update({
      where: { id: attacker.id },
      data: { stamina: 0, staminaUpdatedAt: new Date(Date.now() - 3 * DAY_MS) },
    });
    const plan = await preview(log.id);
    const item = plan.items.find((entry) => entry.kind === 'STAMINA');
    expect(item?.applied).toBe('0');
    expect(item?.note).toBe('staminaFull');
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'stamina',
      goldMode: 'full',
      planHash: plan.hash,
    });
    const row = await prisma.users.findUniqueOrThrow({
      where: { id: attacker.id },
    });
    expect(row.stamina).toBe(row.maxStamina);
  });

  test('N7: the void record outlives its battle log', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    await confirm(log.id);
    await prisma.attack_log.delete({ where: { id: log.id } });
    const record = await prisma.attackLogVoid.findFirstOrThrow();
    expect(record.attackLogId).toBeNull();
    expect(record.battleId).toBe(log.id);
    expect(
      (record.ledger as { items: unknown[] }).items.length,
    ).toBeGreaterThan(0);
  });
});

describe('review round 3', () => {
  const dungeonFight = async () => {
    await setShowDungeon(true);
    const { attacker, defender } = await arena({ attackerFort: DUNGEON_FORT });
    const beforeD = await snapshot(defender.id);
    const log = await fight(attacker.id, defender.id);
    const captive = await prisma.captive.findFirstOrThrow({
      where: { captorId: attacker.id, sourceId: defender.id },
    });
    return { attacker, defender, beforeD, log, captive };
  };

  test('N10: a battle without a void ledger never matches a later battle’s ransom', async () => {
    const { attacker, defender, log, captive } = await dungeonFight();
    // An older (pre-ledger) battle whose captives are long gone...
    await prisma.attack_log.update({
      where: { id: log.id },
      data: {
        stats: Object.fromEntries(
          Object.entries(log.stats as object).filter(
            ([key]) => key !== 'voidLedger',
          ),
        ) as never,
      },
    });
    await prisma.captive.deleteMany({ where: { captorId: attacker.id } });
    // ...and a LATER battle's ransom of a same-shaped stack.
    await prisma.captiveEvent.create({
      data: {
        captorId: attacker.id,
        sourceId: defender.id,
        kind: 'RANSOMED',
        unitType: captive.unitType,
        unitLevel: captive.unitLevel,
        quantity: captive.quantity,
        gold: 1_000n,
        details: {
          result: { captiveId: 9999, gold: '1000', captorShare: '400' },
        },
      },
    });
    const plan = await preview(log.id);
    expect(
      plan.items.filter((item) => item.kind.startsWith('CAPTIVE_RANSOM')),
    ).toHaveLength(0);
    expect(
      plan.items.some(
        (item) =>
          item.kind === 'CAPTIVE_RELEASE' && item.status === 'not_reversed',
      ),
    ).toBe(true);
  });

  test('N10: an event one void consumed cannot settle a second battle (no double refund)', async () => {
    const { attacker, defender, log, captive } = await dungeonFight();
    await CaptiveService.ransom({
      userId: defender.id,
      captiveId: captive.id,
      operationId: randomUUID(),
    });
    await confirm(log.id);
    const record = await prisma.attackLogVoid.findFirstOrThrow();
    const consumed = (record.ledger as { consumedEvents: number[] })
      .consumedEvents;
    expect(consumed.length).toBeGreaterThan(0);
    // A second log that carries the same captive id in its ledger.
    const second = await prisma.attack_log.create({
      data: {
        attacker_id: attacker.id,
        defender_id: defender.id,
        timestamp: new Date(),
        winner: attacker.id,
        type: 'attack',
        stats: log.stats as never,
        pillaged_gold: 0n,
      },
    });
    const plan = await preview(second.id);
    expect(
      plan.items.filter((item) => item.kind.startsWith('CAPTIVE_RANSOM')),
    ).toHaveLength(0);
  });

  test('N11: overlapping removals from one stack are capped in turn, so the void still succeeds', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    const stats = log.stats as { voidLedger: Record<string, unknown> };
    await prisma.attack_log.update({
      where: { id: log.id },
      data: {
        stats: {
          ...stats,
          captives_taken: 8,
          voidLedger: {
            ...stats.voidLedger,
            captives: [
              { id: 901, type: 'OFFENSE', level: 1, quantity: 4 },
              { id: 902, type: 'OFFENSE', level: 1, quantity: 4 },
            ],
            reanimation: {
              day: getOTDayKey(),
              attacker: [{ unitType: 'OFFENSE', quantity: 4 }],
              defender: [],
            },
          },
        } as never,
      },
    });
    for (const id of [901, 902])
      await prisma.captiveEvent.create({
        data: {
          captorId: attacker.id,
          sourceId: defender.id,
          kind: 'CONVERTED',
          unitType: 'OFFENSE',
          unitLevel: 1,
          quantity: 4,
          details: { result: { captiveId: id, toLevel: 1, gold: '0' } },
        },
      });
    await setUnits(attacker.id, 'OFFENSE', 5);
    const plan = await preview(log.id);
    const removals = plan.items.filter(
      (item) =>
        item.kind === 'CAPTIVE_CONVERTED_REMOVE' ||
        item.kind === 'REANIMATED_REMOVE',
    );
    expect(removals.map((item) => item.applied)).toEqual(['4', '1', '0']);
    expect(removals.map((item) => item.status)).toEqual([
      'reverse',
      'capped',
      'capped',
    ]);
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'overlap',
      goldMode: 'full',
      planHash: plan.hash,
    });
    expect(
      (await prisma.attack_log.findUniqueOrThrow({ where: { id: log.id } }))
        .voidedAt,
    ).not.toBeNull();
    expect(
      await prisma.userUnit.count({
        where: { userId: attacker.id, quantity: { lt: 0 } },
      }),
    ).toBe(0);
  });

  test('N12: gold taken from the bank leaves a bank history row', async () => {
    const { attacker, defender } = await arena();
    const log = await fight(attacker.id, defender.id);
    const row = await prisma.users.findUniqueOrThrow({
      where: { id: attacker.id },
    });
    await prisma.users.update({
      where: { id: attacker.id },
      data: { gold: 0n, gold_in_bank: row.gold_in_bank + row.gold },
    });
    await confirm(log.id);
    const history = await prisma.bank_history.findMany({
      where: { history_type: 'WAR_SPOILS_VOID_BANK' },
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      gold_amount: log.pillaged_gold,
      from_user_id: attacker.id,
      from_user_account_type: 'BANK',
    });
  });

  test('N12: the notices count the ransom clawback and refund in the gold totals', async () => {
    const { attacker, defender, log, captive } = await dungeonFight();
    await CaptiveService.ransom({
      userId: defender.id,
      captiveId: captive.id,
      operationId: randomUUID(),
    });
    const plan = await preview(log.id);
    const sum = (kinds: string[], side: string) =>
      plan.items
        .filter((item) => kinds.includes(item.kind) && item.side === side)
        .reduce((total, item) => total + BigInt(item.applied), 0n);
    const lost = sum(['GOLD_ATTACKER', 'CAPTIVE_RANSOM_CLAW'], 'attacker');
    const gained = sum(['GOLD_DEFENDER', 'CAPTIVE_RANSOM_REFUND'], 'defender');
    expect(
      plan.items.some((item) => item.kind === 'CAPTIVE_RANSOM_REFUND'),
    ).toBe(true);
    await voidBattle({
      logId: log.id,
      actorId: adminId,
      reason: 'totals',
      goldMode: 'full',
      planHash: plan.hash,
    });
    const messageTo = async (userId: number) =>
      (
        await prisma.chatMessage.findFirstOrThrow({
          where: {
            room: { participants: { some: { userId } } },
            senderId: adminId,
          },
        })
      ).content;
    expect(await messageTo(attacker.id)).toContain(
      `-${lost.toLocaleString('en')}`,
    );
    expect(await messageTo(defender.id)).toContain(
      `+${gained.toLocaleString('en')}`,
    );
  });
});
