import { createHash } from 'crypto';

import { Fortifications } from '@/constants';
import { capturableCombatRows, distributeCaptures } from '@/constants/Captives';
import { deadCombatRows, distributeReanimation } from '@/constants/Reanimation';
import { levelXPArray } from '@/constants/XPLevels';
import prisma from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { asRecord } from '@/utils/adminCombat';
import { recomputeStoredStatsInTx } from '@/utils/adminRecomputeStats';
import { logActionStrict } from '@/utils/auditLogger';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import { DEFAULT_STAMINA_RULES, projectStamina } from '@/utils/stamina';
import {
  ForcePolicySchema,
  MAX_FORCE_QUANTITY,
  MERCENARY_ROLE_CAP,
  mercenaryShareCap,
} from '@/utils/temporaryForces';
import { getGameDayKey } from '@/utils/timefunctions';
import { getLevelFromXP } from '@/utils/utilities';

import de from '../../public/locales/de/battle.json';
import en from '../../public/locales/en/battle.json';
import es from '../../public/locales/es/battle.json';

type Tx = Prisma.TransactionClient;

export const VOID_REASON_MAX_LENGTH = 500;

/** `full` credits the defender the whole pillage; `recovered` only what was clawed back. */
export type VoidGoldMode = 'full' | 'recovered';
export type VoidItemStatus = 'reverse' | 'capped' | 'not_reversed';
export type VoidSide = 'attacker' | 'defender' | 'alliance';

/** One compensating operation (or a documented non-reversal) of a void plan. */
export interface VoidItem {
  kind: string;
  side: VoidSide;
  userId?: number;
  allianceId?: number;
  /** Interpolation variables for the `void.items.<kind>` label. */
  vars: Record<string, string | number>;
  /** Amount the battle moved, as a decimal string. */
  recorded: string;
  /** Amount this void applies now (never negative, never more than exists). */
  applied: string;
  status: VoidItemStatus;
  /** `void.notes.<note>` explains a cap or a non-reversal. */
  note?: string;
  payload: Record<string, string | number | boolean | null>;
}

export interface VoidPlan {
  logId: number;
  attackerId: number;
  defenderId: number;
  attackerName: string;
  defenderName: string;
  goldMode: VoidGoldMode;
  items: VoidItem[];
  hash: string;
}

export class BattleVoidError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const USER_SELECT = {
  id: true,
  display_name: true,
  locale: true,
  gold: true,
  gold_in_bank: true,
  experience: true,
  attack_turns: true,
  stamina: true,
  staminaUpdatedAt: true,
  maxStamina: true,
  fort_level: true,
  fort_hitpoints: true,
  wounded_units: true,
  stats: true,
  kingdom_morale: true,
  defense_pressure_today: true,
  defense_pressure_date: true,
  reanimated_today: true,
  reanimation_day: true,
  sanctuary_recovered_today: true,
  sanctuary_day: true,
  currentEraId: true,
} as const;

type VoidUser = Prisma.usersGetPayload<{ select: typeof USER_SELECT }>;

type UnitRow = {
  type: string;
  level: number;
  quantity: number;
  isMercenary: boolean;
  forceContractId?: number;
};

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const big = (value: unknown): bigint => {
  try {
    return value == null || value === '' ? 0n : BigInt(value as string);
  } catch {
    return 0n;
  }
};

const minBig = (a: bigint, b: bigint) => (a < b ? a : b);

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const unitRows = (value: unknown): UnitRow[] => {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((entry) => asRecord(entry))
    .filter((row) => typeof row.type === 'string' && num(row.quantity) > 0)
    .map((row) => ({
      type: String(row.type),
      level: num(row.level) || 1,
      quantity: Math.floor(num(row.quantity)),
      isMercenary: !!row.isMercenary,
      forceContractId:
        row.forceContractId == null ? undefined : num(row.forceContractId),
    }));
};

const lossRows = (stats: Record<string, unknown>, side: string): UnitRow[] =>
  unitRows(asRecord(parseJson(stats[`${side}_losses`])).units);

const woundedRows = (stats: Record<string, unknown>, side: string): UnitRow[] =>
  unitRows(asRecord(parseJson(stats.wounded))[side]);

const unitKey = (row: { type: string; level: number; isMercenary?: boolean }) =>
  `${row.type}:${row.level}:${row.isMercenary ? 1 : 0}`;

/** The XP at which a level starts (never below this when removing XP). */
const levelFloor = (xp: number) => {
  const level = getLevelFromXP(xp);
  return levelXPArray.find((entry) => entry.level === level)?.xp ?? 0;
};

const fortMaxHitpoints = (level: number) =>
  Fortifications.find((entry) => entry.level === level)?.hitpoints ?? 0;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Alliances the void may touch, known before any lock is taken. */
async function touchedAllianceIds(tx: Tx, logId: number): Promise<number[]> {
  const log = await tx.attack_log.findUnique({
    where: { id: logId },
    select: { stats: true },
  });
  const stats = asRecord(log?.stats);
  const ids = new Set<number>();
  const ledger = asRecord(stats.voidLedger);
  for (const entry of Array.isArray(ledger.loanRepayments)
    ? ledger.loanRepayments
    : [])
    ids.add(num(asRecord(entry).allianceId));
  if (typeof stats.forcePillageKey === 'string') {
    const events = await tx.forceEvent.findMany({
      where: {
        operationKey: { startsWith: `force-tax:${stats.forcePillageKey}:` },
      },
      select: { details: true },
    });
    for (const event of events)
      ids.add(num(asRecord(event.details).allianceId));
  }
  ids.delete(0);
  return [...ids].sort((a, b) => a - b);
}

/**
 * Builds the compensation plan for one battle from its log and the CURRENT
 * state of both players. Pure reads: preview runs it unlocked, confirm reruns
 * it under the locks and refuses to apply a plan the admin did not see.
 */
export async function computeVoidPlan(
  tx: Tx,
  logId: number,
  goldMode: VoidGoldMode,
): Promise<{ plan: VoidPlan; log: VoidLog }> {
  const log = await tx.attack_log.findUnique({
    where: { id: logId },
    select: {
      id: true,
      type: true,
      timestamp: true,
      winner: true,
      attacker_id: true,
      defender_id: true,
      pillaged_gold: true,
      stats: true,
      voidedAt: true,
    },
  });
  if (!log) throw new BattleVoidError(404, 'NOT_FOUND', 'Battle not found');
  if (log.type !== 'attack')
    throw new BattleVoidError(
      422,
      'UNSUPPORTED_TYPE',
      'Only battles can be voided',
    );
  if (log.voidedAt)
    throw new BattleVoidError(
      409,
      'ALREADY_VOIDED',
      'This battle has already been voided',
    );
  // Everything the plan reads is fingerprinted into its hash, so a confirm
  // can only apply to the exact state the admin previewed (#229 review).
  const reads: unknown[] = [];
  const rd = <T>(label: string, value: T): T => {
    reads.push([label, value]);
    return value;
  };
  rd('log', log);
  const stats = asRecord(log.stats);
  const ledger = asRecord(stats.voidLedger);
  const hasLedger = ledger.version === 1;
  // Only the slow-moving parts of a player are fingerprinted. Gold, turns,
  // XP, stamina, morale and the like change on every turn tick; the plan
  // already carries the amounts it derived from them, and confirm recomputes
  // under locks and applies only those recomputed items.
  const slowMoving = (user: VoidUser) => ({
    id: user.id,
    currentEraId: user.currentEraId,
    fort_level: user.fort_level,
    wounded_units: user.wounded_units,
    defense_pressure_date: user.defense_pressure_date,
    reanimated_today: user.reanimated_today,
    reanimation_day: user.reanimation_day,
    sanctuary_recovered_today: user.sanctuary_recovered_today,
    sanctuary_day: user.sanctuary_day,
  });
  const attacker = await tx.users.findUniqueOrThrow({
    where: { id: log.attacker_id },
    select: USER_SELECT,
  });
  const defender = await tx.users.findUniqueOrThrow({
    where: { id: log.defender_id },
    select: USER_SELECT,
  });
  rd('attacker', slowMoving(attacker));
  rd('defender', slowMoving(defender));
  // The whole roster and every contract of both players, not only the rows a
  // given item names: any change to them changes the plan's meaning.
  const rosterOf = async (userId: number) =>
    tx.userUnit.findMany({
      where: { userId },
      orderBy: [{ type: 'asc' }, { level: 'asc' }, { isMercenary: 'asc' }],
    });
  const contractsOf = async (userId: number) =>
    rd(
      `contracts:${userId}`,
      await tx.forceContract.findMany({
        where: { userId },
        orderBy: { id: 'asc' },
      }),
    );
  const rosters = {
    attacker: await rosterOf(attacker.id),
    defender: await rosterOf(defender.id),
  };
  const contracts = {
    attacker: await contractsOf(attacker.id),
    defender: await contractsOf(defender.id),
  };
  const users: Record<'attacker' | 'defender', VoidUser> = {
    attacker,
    defender,
  };
  // A battle from an earlier era cannot be compensated into the current one:
  // its armies, fort and loot belong to a world that was reset.
  const logTime = log.timestamp ?? new Date(0);
  const activeEra = await tx.era.findFirst({
    where: { endDate: null },
    orderBy: { startDate: 'desc' },
    select: { id: true, startDate: true },
  });
  rd('era', activeEra);
  if (
    !activeEra ||
    logTime < activeEra.startDate ||
    attacker.currentEraId !== activeEra.id ||
    defender.currentEraId !== activeEra.id
  )
    throw new BattleVoidError(
      422,
      'PREVIOUS_ERA',
      'This battle belongs to an earlier era and can no longer be voided',
    );
  const attackerWon = log.winner === log.attacker_id;
  const battleDay = getGameDayKey(log.timestamp ?? new Date());
  const now = new Date();
  const items: VoidItem[] = [];
  const add = (
    item: Omit<VoidItem, 'status'> & { status?: VoidItemStatus },
  ) => {
    const recorded = big(item.recorded);
    const applied = big(item.applied);
    const status: VoidItemStatus =
      item.status ?? (applied < recorded ? 'capped' : 'reverse');
    items.push({ ...item, status });
  };
  const notReversed = (
    kind: string,
    side: VoidSide,
    note: string,
    recorded: number | bigint | string,
    extra: Partial<VoidItem> = {},
  ) =>
    add({
      kind,
      side,
      vars: {},
      recorded: String(recorded),
      applied: '0',
      status: 'not_reversed',
      note,
      payload: {},
      ...extra,
    });

  // ---- Gold ---------------------------------------------------------------
  const pillage = big(log.pillaged_gold);
  const forceCut = big(stats.forcePillageContribution);
  const loanCut = big(stats.goldLoanRepayment);
  const attackerNet = pillage - forceCut - loanCut;
  const allianceBank = new Map<number, bigint>();
  const bankOf = async (allianceId: number) => {
    if (!allianceBank.has(allianceId)) {
      const row = await tx.alliances.findUnique({
        where: { id: allianceId },
        select: { gold_in_bank: true },
      });
      allianceBank.set(allianceId, big(row?.gold_in_bank));
    }
    return allianceBank.get(allianceId) ?? 0n;
  };

  let recoveredTotal = 0n;
  // The attacker may have banked the loot: take from hand first, then bank.
  // One budget serves every clawback from the attacker in this plan.
  let attackerHand = big(attacker.gold);
  let attackerBank = big(attacker.gold_in_bank);
  const takeFromAttacker = (wanted: bigint) => {
    const hand = minBig(wanted > 0n ? wanted : 0n, attackerHand);
    const bank = minBig((wanted > 0n ? wanted : 0n) - hand, attackerBank);
    attackerHand -= hand;
    attackerBank -= bank;
    return { hand, bank, total: hand + bank };
  };
  const taken = takeFromAttacker(attackerNet);
  const attackerClaw = taken.total;
  if (attackerNet > 0n) {
    recoveredTotal += attackerClaw;
    add({
      kind: 'GOLD_ATTACKER',
      side: 'attacker',
      userId: attacker.id,
      vars: {},
      recorded: attackerNet.toString(),
      applied: attackerClaw.toString(),
      note: attackerClaw < attackerNet ? 'goldSpent' : undefined,
      payload: {
        amount: attackerClaw.toString(),
        hand: taken.hand.toString(),
        bank: taken.bank.toString(),
      },
    });
  }

  // Force-pillage cuts: exact through the per-alliance ForceEvent rows.
  if (forceCut > 0n) {
    const key =
      typeof stats.forcePillageKey === 'string' ? stats.forcePillageKey : '';
    const events = rd(
      'forceEvents',
      key
        ? await tx.forceEvent.findMany({
            where: { operationKey: { startsWith: `force-tax:${key}:` } },
            orderBy: { id: 'asc' },
          })
        : [],
    );
    const found = events.reduce((sum, event) => sum + event.gold, 0n);
    for (const event of events) {
      const allianceId = num(asRecord(event.details).allianceId);
      if (event.action === 'PILLAGE_PENDING') {
        recoveredTotal += event.gold;
        add({
          kind: 'FORCE_CUT_PENDING',
          side: 'alliance',
          allianceId,
          vars: { allianceId },
          recorded: event.gold.toString(),
          applied: event.gold.toString(),
          payload: {
            eventId: event.id,
            allianceId,
            amount: event.gold.toString(),
          },
        });
      } else if (event.action === 'PILLAGE_SETTLED') {
        const available = await bankOf(allianceId);
        const claw = minBig(event.gold, available);
        allianceBank.set(allianceId, available - claw);
        recoveredTotal += claw;
        add({
          kind: 'FORCE_CUT_SETTLED',
          side: 'alliance',
          allianceId,
          vars: { allianceId },
          recorded: event.gold.toString(),
          applied: claw.toString(),
          note: claw < event.gold ? 'treasurySpent' : undefined,
          payload: {
            eventId: event.id,
            allianceId,
            amount: claw.toString(),
            key,
          },
        });
      } else {
        notReversed(
          'FORCE_CUT_SETTLED',
          'alliance',
          'forceCutClosed',
          event.gold,
          {
            allianceId,
            vars: { allianceId },
          },
        );
      }
    }
    if (found < forceCut)
      notReversed(
        'FORCE_CUT_SETTLED',
        'alliance',
        'forceCutMissing',
        forceCut - found,
      );
  }

  // Loan repayments: exact when the battle recorded them.
  if (loanCut > 0n) {
    const repayments = hasLedger
      ? (Array.isArray(ledger.loanRepayments) ? ledger.loanRepayments : []).map(
          (entry) => asRecord(entry),
        )
      : [];
    if (!repayments.length)
      notReversed('LOAN_REPAYMENT', 'alliance', 'loanNotRecorded', loanCut);
    for (const repayment of repayments) {
      const loanId = num(repayment.loanId);
      const allianceId = num(repayment.allianceId);
      const amount = big(repayment.amount);
      const loan = rd(
        `loan:${loanId}`,
        await tx.alliance_loans.findUnique({ where: { id: loanId } }),
      );
      if (!loan || !['ACTIVE', 'DEFAULTED', 'REPAID'].includes(loan.status)) {
        notReversed('LOAN_REPAYMENT', 'alliance', 'loanClosed', amount, {
          allianceId,
          vars: { loanId },
        });
        continue;
      }
      // The debt comes back only as far as the treasury gives the gold back:
      // never an alliance that keeps the gold AND gets the debt again.
      const owedBack = minBig(amount, big(loan.amount_repaid));
      const pendingTake = minBig(owedBack, big(loan.pending_treasury_credit));
      const available = await bankOf(allianceId);
      const bankTake = minBig(owedBack - pendingTake, available);
      const reinstate = pendingTake + bankTake;
      allianceBank.set(allianceId, available - bankTake);
      recoveredTotal += pendingTake + bankTake;
      add({
        kind: 'LOAN_REPAYMENT',
        side: 'alliance',
        allianceId,
        vars: { loanId },
        recorded: amount.toString(),
        applied: reinstate.toString(),
        note: reinstate < amount ? 'treasurySpent' : undefined,
        status: reinstate < amount ? 'capped' : 'reverse',
        payload: {
          loanId,
          allianceId,
          reinstate: reinstate.toString(),
          pendingTake: pendingTake.toString(),
          bankTake: bankTake.toString(),
        },
      });
    }
  }

  if (pillage > 0n) {
    const credit =
      goldMode === 'full' ? pillage : minBig(pillage, recoveredTotal);
    add({
      kind: 'GOLD_DEFENDER',
      side: 'defender',
      userId: defender.id,
      vars: { mode: goldMode },
      recorded: pillage.toString(),
      applied: credit.toString(),
      note: credit < pillage ? 'goldRecoveredOnly' : undefined,
      payload: {
        amount: credit.toString(),
        fromAttacker: attackerClaw.toString(),
      },
    });
  }

  // ---- Units --------------------------------------------------------------
  const defenderKilled = lossRows(stats, 'defender');
  const sanctuaryTotal = num(stats.sanctuary_recovered);
  const capturesTotal = num(stats.captives_taken);

  // Elf sanctuary recoveries are alive already: exact from the ledger, or
  // re-derived with the same deterministic split the battle used.
  let sanctuaryGrants: Array<{
    type: string;
    level: number;
    quantity: number;
  }> = [];
  if (sanctuaryTotal > 0) {
    if (hasLedger) {
      sanctuaryGrants = unitRows(asRecord(ledger.sanctuary).grants);
    } else {
      const rows = deadCombatRows(defenderKilled, capturesTotal);
      const split = distributeReanimation(
        rows.map((row) => row.quantity),
        sanctuaryTotal,
      );
      sanctuaryGrants = rows
        .map((row, index) => ({
          type: row.type,
          level: row.level,
          quantity: split[index],
        }))
        .filter((row) => row.quantity > 0);
    }
  }

  // Several removals can hit one stack (converted captives demoted to the same
  // level, risen units, escapees as citizens). Count what is left as the plan
  // is built, so later items are capped instead of failing their guard.
  const stackLeft = new Map<string, number>();
  const takeFromStack = (
    side: 'attacker' | 'defender',
    type: string,
    level: number,
    wanted: number,
  ) => {
    const key = `${side}:${type}:${level}`;
    if (!stackLeft.has(key))
      stackLeft.set(
        key,
        rosters[side].find(
          (row) => row.type === type && row.level === level && !row.isMercenary,
        )?.quantity ?? 0,
      );
    const take = Math.min(Math.max(0, wanted), stackLeft.get(key) ?? 0);
    stackLeft.set(key, (stackLeft.get(key) ?? 0) - take);
    return take;
  };

  // Captives still in the dungeon go back; ones already ransomed, released,
  // converted or escaped are not restored a second time.
  const captiveRelease: Array<{
    id: number;
    type: string;
    level: number;
    quantity: number;
  }> = [];
  const captiveGone = new Map<string, number>();
  if (capturesTotal > 0) {
    let wanted: Array<{
      id?: number;
      type: string;
      level: number;
      quantity: number;
    }> = [];
    if (hasLedger && Array.isArray(ledger.captives)) {
      wanted = ledger.captives.map((entry) => {
        const row = asRecord(entry);
        return {
          id: num(row.id),
          type: String(row.type),
          level: num(row.level),
          quantity: num(row.quantity),
        };
      });
    } else {
      const rows = capturableCombatRows(defenderKilled);
      const takes = distributeCaptures(
        rows.map((row) => row.quantity),
        capturesTotal,
      );
      wanted = rows
        .map((row, index) => ({
          type: row.type,
          level: row.level,
          quantity: takes[index],
        }))
        .filter((row) => row.quantity > 0);
    }
    const stamp = (log.timestamp ?? now).getTime();
    const used = new Set<number>();
    const usedEvents = new Set<number>();
    for (const want of wanted) {
      const row = want.id
        ? rd(
            `captive:${want.id}`,
            await tx.captive.findUnique({ where: { id: want.id } }),
          )
        : (rd(
            `captives:${want.type}:${want.level}:${want.quantity}`,
            await tx.captive.findMany({
              where: {
                captorId: log.attacker_id,
                sourceId: log.defender_id,
                unitType: want.type as never,
                unitLevel: want.level,
                quantity: want.quantity,
                capturedAt: {
                  gte: new Date(stamp - 10 * 60_000),
                  lte: new Date(stamp + 10 * 60_000),
                },
              },
              orderBy: { id: 'asc' },
            }),
          ).find((candidate) => !used.has(candidate.id)) ?? null);
      if (row) {
        used.add(row.id);
        captiveRelease.push({
          id: row.id,
          type: want.type,
          level: want.level,
          quantity: row.quantity,
        });
        add({
          kind: 'CAPTIVE_RELEASE',
          side: 'defender',
          userId: defender.id,
          vars: { type: want.type, level: want.level },
          recorded: String(want.quantity),
          applied: String(row.quantity),
          payload: {
            captiveId: row.id,
            type: want.type,
            level: want.level,
            quantity: row.quantity,
          },
        });
      } else {
        // Already ransomed, converted, released or escaped: the ledger of
        // captive events says which, and each outcome is undone for what it
        // actually moved.
        const key = unitKey({ type: want.type, level: want.level });
        // Without a ledger there is no captive id to tie an event to this
        // battle, and a later battle's ransom could be mistaken for it: such
        // battles stay "not reversed".
        const found = !hasLedger
          ? []
          : await tx.captiveEvent.findMany({
              where: {
                captorId: log.attacker_id,
                sourceId: log.defender_id,
                unitType: want.type as never,
                unitLevel: want.level,
                quantity: want.quantity,
                kind: { in: ['RANSOMED', 'CONVERTED', 'ESCAPED', 'RELEASED'] },
                createdAt: { gte: new Date(stamp - 60_000) },
              },
              orderBy: { id: 'asc' },
            });
        // An event settles one battle only: skip any another void consumed.
        const events: typeof found = [];
        for (const candidate of found) {
          const consumed = await tx.attackLogVoid.findFirst({
            where: {
              ledger: {
                path: ['consumedEvents'],
                array_contains: candidate.id,
              },
            },
            select: { id: true },
          });
          if (!consumed) events.push(candidate);
        }
        rd(`captiveEvents:${want.type}:${want.level}:${want.quantity}`, [
          found.map((candidate) => candidate.id),
          events.map((candidate) => candidate.id),
        ]);
        // An escape records no captive id: it is only trusted when no later
        // battle between the pair captured a stack of the same shape.
        const laterSameShape =
          events.some((candidate) => candidate.kind === 'ESCAPED') &&
          (
            await tx.attack_log.findMany({
              where: {
                id: { gt: log.id },
                attacker_id: log.attacker_id,
                defender_id: log.defender_id,
                type: 'attack',
              },
              select: { stats: true },
            })
          ).some((other) =>
            (Array.isArray(asRecord(asRecord(other.stats).voidLedger).captives)
              ? (asRecord(asRecord(other.stats).voidLedger)
                  .captives as unknown[])
              : []
            ).some((entry) => {
              const row = asRecord(entry);
              return (
                row.type === want.type &&
                num(row.level) === want.level &&
                num(row.quantity) === want.quantity
              );
            }),
          );
        const resultOf = (event: (typeof events)[number]) =>
          asRecord(asRecord(event.details).result);
        const unused = events.filter(
          (candidate) =>
            !usedEvents.has(candidate.id) &&
            !(laterSameShape && candidate.kind === 'ESCAPED'),
        );
        // Exact by the captive id the event recorded; escapes record none, so
        // they match by troop type, level, size and time instead.
        const event =
          (want.id == null
            ? undefined
            : unused.find(
                (candidate) => num(resultOf(candidate).captiveId) === want.id,
              )) ??
          unused.find((candidate) =>
            num(resultOf(candidate).captiveId) === 0
              ? candidate.kind === 'ESCAPED'
              : want.id == null,
          );
        if (event) usedEvents.add(event.id);
        const vars = { type: want.type, level: want.level };
        if (event?.kind === 'RANSOMED') {
          // The troops went home on payment: nothing to restore twice, but
          // the ransom is taken back from the captor's share and refunded.
          captiveGone.set(key, (captiveGone.get(key) ?? 0) + want.quantity);
          const price = big(resultOf(event).gold ?? event.gold);
          const share = takeFromAttacker(big(resultOf(event).captorShare));
          add({
            kind: 'CAPTIVE_RANSOM_CLAW',
            side: 'attacker',
            userId: attacker.id,
            vars,
            recorded: String(resultOf(event).captorShare ?? '0'),
            applied: share.total.toString(),
            note:
              share.total < big(resultOf(event).captorShare)
                ? 'goldSpent'
                : undefined,
            payload: {
              amount: share.total.toString(),
              hand: share.hand.toString(),
              bank: share.bank.toString(),
              eventId: event.id,
            },
          });
          const refund =
            goldMode === 'full' ? price : minBig(price, share.total);
          add({
            kind: 'CAPTIVE_RANSOM_REFUND',
            side: 'defender',
            userId: defender.id,
            vars,
            recorded: price.toString(),
            applied: refund.toString(),
            note: refund < price ? 'goldRecoveredOnly' : undefined,
            payload: { amount: refund.toString(), eventId: event.id },
          });
        } else if (event?.kind === 'CONVERTED') {
          // The captor kept the troops (demoted): take them back, capped at
          // what the captor still has, and the defender gets theirs restored.
          const toLevel = num(resultOf(event).toLevel) || want.level;
          const remove = takeFromStack(
            'attacker',
            want.type,
            toLevel,
            want.quantity,
          );
          add({
            kind: 'CAPTIVE_CONVERTED_REMOVE',
            side: 'attacker',
            userId: attacker.id,
            vars: { type: want.type, level: toLevel },
            recorded: String(want.quantity),
            applied: String(remove),
            note: remove < want.quantity ? 'unitsLostSince' : undefined,
            payload: {
              type: want.type,
              level: toLevel,
              quantity: remove,
              eventId: event.id,
            },
          });
        } else if (event?.kind === 'ESCAPED') {
          // Escapees came home as citizens: the troops are restored and those
          // citizens are taken back out.
          const remove = takeFromStack('defender', 'CITIZEN', 1, want.quantity);
          add({
            kind: 'CAPTIVE_ESCAPED_CITIZENS',
            side: 'defender',
            userId: defender.id,
            vars,
            recorded: String(want.quantity),
            applied: String(remove),
            note: remove < want.quantity ? 'unitsLostSince' : undefined,
            payload: { quantity: remove, eventId: event.id },
          });
        } else {
          captiveGone.set(key, (captiveGone.get(key) ?? 0) + want.quantity);
          notReversed(
            'CAPTIVE_RELEASE',
            'defender',
            'captiveResolved',
            want.quantity,
            { userId: defender.id, vars },
          );
        }
      }
    }
  }

  for (const side of ['attacker', 'defender'] as const) {
    const user = users[side];
    const killed = lossRows(stats, side);
    const wounded = woundedRows(stats, side);

    // Killed units of the player's own roster come back as the same stacks.
    const restore = new Map<string, UnitRow>();
    for (const row of killed.filter((entry) => !entry.forceContractId)) {
      const key = unitKey(row);
      const existing = restore.get(key);
      if (existing) existing.quantity += row.quantity;
      else restore.set(key, { ...row });
    }
    if (side === 'defender') {
      for (const grant of sanctuaryGrants) {
        const entry = restore.get(unitKey(grant));
        if (entry)
          entry.quantity = Math.max(0, entry.quantity - grant.quantity);
      }
      for (const [key, quantity] of captiveGone) {
        const entry = restore.get(key);
        if (entry) entry.quantity = Math.max(0, entry.quantity - quantity);
      }
    }

    // Wounded: only those still in the recovering pool can be released; the
    // rest were healed back to duty already.
    const pool = (
      Array.isArray(user.wounded_units) ? user.wounded_units : []
    ).map((entry) => asRecord(entry));
    const poolLeft = pool.map((entry) => num(entry.quantity));
    for (const group of wounded) {
      const index = pool.findIndex(
        (entry, i) =>
          poolLeft[i] > 0 &&
          entry.type === group.type &&
          num(entry.level) === group.level &&
          !!entry.isMercenary === group.isMercenary &&
          (entry.forceContractId == null
            ? undefined
            : num(entry.forceContractId)) === group.forceContractId,
      );
      const release = index < 0 ? 0 : Math.min(group.quantity, poolLeft[index]);
      if (index >= 0) poolLeft[index] -= release;
      add({
        kind: 'WOUNDED_RELEASE',
        side,
        userId: user.id,
        vars: { type: group.type, level: group.level },
        recorded: String(group.quantity),
        applied: String(release),
        note: release < group.quantity ? 'woundedHealed' : undefined,
        status: 'reverse',
        payload: {
          type: group.type,
          level: group.level,
          isMercenary: group.isMercenary,
          forceContractId: group.forceContractId ?? null,
          quantity: release,
        },
      });
      if (release > 0 && !group.forceContractId) {
        const key = unitKey(group);
        const entry = restore.get(key);
        if (entry) entry.quantity += release;
        else restore.set(key, { ...group, quantity: release });
      }
    }

    // Reanimated units rise as level-1 stacks; remove them first, capped.
    const grants = hasLedger
      ? unitRowsFromGrants(asRecord(ledger.reanimation)[side])
      : [];
    if (!hasLedger && num(asRecord(stats.reanimated_units)[side]) > 0)
      notReversed(
        'REANIMATED_REMOVE',
        side,
        'reanimationNotRecorded',
        num(asRecord(stats.reanimated_units)[side]),
        { userId: user.id },
      );
    let grantedTotal = 0;
    for (const grant of grants) {
      grantedTotal += grant.quantity;
      const remove = takeFromStack(side, grant.type, 1, grant.quantity);
      add({
        kind: 'REANIMATED_REMOVE',
        side,
        userId: user.id,
        vars: { type: grant.type },
        recorded: String(grant.quantity),
        applied: String(remove),
        note: remove < grant.quantity ? 'unitsLostSince' : undefined,
        payload: { type: grant.type, quantity: remove },
      });
    }
    if (grantedTotal > 0 && user.reanimation_day === battleDay) {
      const applied = Math.min(grantedTotal, num(user.reanimated_today));
      add({
        kind: 'REANIMATION_COUNTER',
        side,
        userId: user.id,
        vars: {},
        recorded: String(grantedTotal),
        applied: String(applied),
        payload: { amount: applied },
      });
    }
    if (
      side === 'defender' &&
      sanctuaryTotal > 0 &&
      user.sanctuary_day === battleDay
    ) {
      const applied = Math.min(
        sanctuaryTotal,
        num(user.sanctuary_recovered_today),
      );
      add({
        kind: 'SANCTUARY_COUNTER',
        side,
        userId: user.id,
        vars: {},
        recorded: String(sanctuaryTotal),
        applied: String(applied),
        payload: { amount: applied },
      });
    }

    for (const row of [...restore.values()].filter(
      (entry) => entry.quantity > 0,
    ))
      add({
        kind: 'UNITS_RESTORE',
        side,
        userId: user.id,
        vars: { type: row.type, level: row.level },
        recorded: String(
          killed
            .filter(
              (entry) =>
                !entry.forceContractId && unitKey(entry) === unitKey(row),
            )
            .reduce((sum, entry) => sum + entry.quantity, 0),
        ),
        applied: String(row.quantity),
        status: 'reverse',
        payload: {
          type: row.type,
          level: row.level,
          isMercenary: row.isMercenary,
          quantity: row.quantity,
        },
      });

    // Contract troops (mercenary / alliance loans) go back to their contract,
    // but never past what the player could hire or borrow today: capacity is
    // counted across every CURRENT contract and reserved across plan items.
    const byContract = new Map<number, number>();
    for (const row of killed.filter((entry) => entry.forceContractId))
      byContract.set(
        row.forceContractId as number,
        (byContract.get(row.forceContractId as number) ?? 0) + row.quantity,
      );
    if (byContract.size) {
      const isActive = (contract: (typeof contracts)['attacker'][number]) =>
        contract.status === 'ACTIVE' &&
        !!contract.expiresAt &&
        contract.expiresAt > now &&
        (contract.eraId ?? null) === (user.currentEraId ?? null);
      const roleUsed = new Map<string, number>();
      const allianceUsed = new Map<number, number>();
      let mercenaryUsed = 0;
      for (const contract of contracts[side].filter(isActive)) {
        if (contract.kind === 'MERCENARY') {
          roleUsed.set(
            contract.type,
            (roleUsed.get(contract.type) ?? 0) + contract.survivingQuantity,
          );
          mercenaryUsed += contract.survivingQuantity;
        } else if (contract.allianceId != null) {
          allianceUsed.set(
            contract.allianceId,
            (allianceUsed.get(contract.allianceId) ?? 0) +
              contract.survivingQuantity,
          );
        }
      }
      // The share cap follows the trained army AS RESTORED by this void.
      const combat = new Set(['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY']);
      const trainedAfter =
        rosters[side]
          .filter((row) => !row.isMercenary && combat.has(row.type))
          .reduce((sum, row) => sum + row.quantity, 0) +
        [...restore.values()]
          .filter((row) => !row.isMercenary && combat.has(row.type))
          .reduce((sum, row) => sum + row.quantity, 0) -
        items
          .filter(
            (item) =>
              (item.kind === 'REANIMATED_REMOVE' ||
                item.kind === 'CAPTIVE_CONVERTED_REMOVE') &&
              item.userId === user.id,
          )
          .reduce((sum, item) => sum + num(item.applied), 0);
      const shareAllowed = mercenaryShareCap(Math.max(0, trainedAfter));
      const forceMax =
        (await getRuntimeConfig(tx)).forceMaxQuantity ?? MAX_FORCE_QUANTITY;
      rd(`capacity:${side}`, {
        trainedAfter,
        shareAllowed,
        forceMax,
        roleUsed: [...roleUsed],
        allianceUsed: [...allianceUsed],
      });
      const allianceCap = async (allianceId: number) => {
        const membership = rd(
          `membership:${user.id}:${allianceId}`,
          await tx.alliance_memberships.findFirst({
            where: { user_id: user.id, alliance_id: allianceId },
            select: { role_id: true },
          }),
        );
        const policy = rd(
          `policy:${allianceId}`,
          await tx.allianceForcePolicy.findFirst({
            where: { allianceId },
            orderBy: { version: 'desc' },
            select: { version: true, settings: true },
          }),
        );
        const allowance = policy
          ? ForcePolicySchema.parse(policy.settings).roleAllowances.find(
              (entry) => entry.roleId === membership?.role_id,
            )
          : undefined;
        return Math.min(allowance?.maxBorrowed ?? forceMax, forceMax);
      };
      for (const [contractId, quantity] of [...byContract].sort(
        (a, b) => a[0] - b[0],
      )) {
        const contract = contracts[side].find((row) => row.id === contractId);
        const open =
          !!contract &&
          contract.userId === user.id &&
          (contract.eraId ?? null) === (user.currentEraId ?? null) &&
          (contract.status === 'ACTIVE' ||
            (contract.status === 'DEPLETED' &&
              !!contract.expiresAt &&
              contract.expiresAt > now));
        if (contract && open) {
          let room = Math.max(
            0,
            contract.initialQuantity - contract.survivingQuantity,
          );
          if (contract.kind === 'MERCENARY') {
            room = Math.min(
              room,
              Math.max(
                0,
                MERCENARY_ROLE_CAP - (roleUsed.get(contract.type) ?? 0),
              ),
              Math.max(0, shareAllowed - mercenaryUsed),
            );
          } else if (contract.allianceId != null) {
            room = Math.min(
              room,
              Math.max(
                0,
                (await allianceCap(contract.allianceId)) -
                  (allianceUsed.get(contract.allianceId) ?? 0),
              ),
            );
          }
          const restored = Math.min(quantity, room);
          if (contract.kind === 'MERCENARY') {
            roleUsed.set(
              contract.type,
              (roleUsed.get(contract.type) ?? 0) + restored,
            );
            mercenaryUsed += restored;
          } else if (contract.allianceId != null) {
            allianceUsed.set(
              contract.allianceId,
              (allianceUsed.get(contract.allianceId) ?? 0) + restored,
            );
          }
          add({
            kind: 'CONTRACT_RESTORE',
            side,
            userId: user.id,
            vars: { contractId, type: contract.type, level: contract.level },
            recorded: String(quantity),
            applied: String(restored),
            note: restored < quantity ? 'contractFull' : undefined,
            payload: {
              contractId,
              quantity: restored,
              reactivate: contract.status === 'DEPLETED' && restored > 0,
            },
          });
          // The excess is paid like a closed contract: gold at the hire price
          // for mercenaries; alliance troops cannot be paid in gold.
          const excess = quantity - restored;
          if (excess > 0) {
            if (contract.kind === 'MERCENARY' && contract.unitPriceGold > 0n)
              add({
                kind: 'CONTRACT_GOLD',
                side,
                userId: user.id,
                vars: { contractId, quantity: excess },
                recorded: String(excess),
                applied: String(excess),
                note: 'contractCapGold',
                payload: {
                  contractId,
                  amount: (contract.unitPriceGold * BigInt(excess)).toString(),
                  quantity: excess,
                },
              });
            else
              notReversed(
                'CONTRACT_RESTORE',
                side,
                'contractCapAlliance',
                excess,
                {
                  userId: user.id,
                  vars: {
                    contractId,
                    type: contract.type,
                    level: contract.level,
                  },
                },
              );
          }
        } else if (
          contract &&
          contract.kind === 'MERCENARY' &&
          contract.unitPriceGold > 0n
        ) {
          const amount = contract.unitPriceGold * BigInt(quantity);
          add({
            kind: 'CONTRACT_GOLD',
            side,
            userId: user.id,
            vars: { contractId, quantity },
            recorded: String(quantity),
            applied: String(quantity),
            note: 'contractClosedGold',
            payload: { contractId, amount: amount.toString(), quantity },
          });
        } else {
          notReversed('CONTRACT_RESTORE', side, 'contractClosed', quantity, {
            userId: user.id,
            vars: {
              contractId,
              type: contract?.type ?? '',
              level: contract?.level ?? 0,
            },
          });
        }
      }
    }
  }

  // ---- Fort, turns, stamina, XP, counters, morale ---------------------------
  const fortStart = num(stats.forthpAtStart);
  const fortEnd = num(stats.forthpAtEnd);
  if (fortStart > fortEnd) {
    const damage = fortStart - fortEnd;
    const room = Math.max(
      0,
      fortMaxHitpoints(defender.fort_level ?? 1) - num(defender.fort_hitpoints),
    );
    add({
      kind: 'FORT_HP',
      side: 'defender',
      userId: defender.id,
      vars: {},
      recorded: String(damage),
      applied: String(Math.min(damage, room)),
      note: room < damage ? 'fortFull' : undefined,
      payload: { amount: Math.min(damage, room) },
    });
  }
  const turns = num(stats.turns);
  if (turns > 0)
    add({
      kind: 'TURNS',
      side: 'attacker',
      userId: attacker.id,
      vars: {},
      recorded: String(turns),
      applied: String(turns),
      payload: { amount: turns },
    });
  const staminaCost = Math.floor(num(stats.stamina_cost));
  if (staminaCost > 0) {
    // Room is measured on the projected stamina (recovery since the last
    // write), exactly as battles spend it.
    const projected = projectStamina(
      {
        stamina: attacker.stamina,
        maxStamina: attacker.maxStamina,
        staminaUpdatedAt: attacker.staminaUpdatedAt,
      },
      (await getRuntimeConfig(tx)).stamina ?? DEFAULT_STAMINA_RULES,
    );
    const room = Math.max(0, projected.maxStamina - projected.stamina);
    add({
      kind: 'STAMINA',
      side: 'attacker',
      userId: attacker.id,
      vars: {},
      recorded: String(staminaCost),
      applied: String(Math.min(staminaCost, room)),
      note: room < staminaCost ? 'staminaFull' : undefined,
      payload: { amount: Math.min(staminaCost, room) },
    });
  }

  const xp = asRecord(parseJson(stats.xpEarned));
  for (const side of ['attacker', 'defender'] as const) {
    const user = users[side];
    const gain = Math.max(0, Math.floor(num(xp[side])));
    if (gain <= 0) continue;
    const removable = Math.max(
      0,
      num(user.experience) - levelFloor(num(user.experience)),
    );
    const applied = Math.min(gain, removable);
    add({
      kind: 'XP',
      side,
      userId: user.id,
      vars: {},
      recorded: String(gain),
      applied: String(applied),
      note: applied < gain ? 'levelFloor' : undefined,
      payload: { amount: applied },
    });
  }

  for (const [side, type, subtype] of [
    ['attacker', 'OFFENSE', attackerWon ? 'WON' : 'LOST'],
    ['defender', 'DEFENSE', attackerWon ? 'LOST' : 'WON'],
  ] as const) {
    add({
      kind: 'COUNTER',
      side,
      userId: users[side].id,
      vars: { type, subtype },
      recorded: '1',
      applied: '1',
      payload: { type, subtype },
    });
  }

  const morale = asRecord(ledger.morale);
  if (hasLedger && morale.applied === true) {
    const current = num(defender.kingdom_morale);
    const next = clamp(
      current + num(morale.before) - num(morale.after),
      0,
      100,
    );
    add({
      kind: 'MORALE',
      side: 'defender',
      userId: defender.id,
      vars: {},
      recorded: String(num(morale.before) - num(morale.after)),
      applied: String(next - current),
      payload: { next },
    });
  } else if (!hasLedger) {
    notReversed('MORALE', 'defender', 'moraleNotRecorded', 0, {
      userId: defender.id,
    });
  }
  const pressure = asRecord(ledger.pressure);
  if (
    hasLedger &&
    defender.defense_pressure_date &&
    getGameDayKey(defender.defense_pressure_date) === battleDay
  ) {
    const delta = num(pressure.before) - num(pressure.after);
    const next = Math.max(0, num(defender.defense_pressure_today) + delta);
    add({
      kind: 'PRESSURE',
      side: 'defender',
      userId: defender.id,
      vars: {},
      recorded: String(delta),
      applied: String(next - num(defender.defense_pressure_today)),
      payload: { next },
    });
  }
  notReversed('DAILY_PROCESSES', 'defender', 'dailyProcesses', 0, {
    userId: defender.id,
  });

  const plan: VoidPlan = {
    logId,
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerName: attacker.display_name,
    defenderName: defender.display_name,
    goldMode,
    items,
    hash: createHash('sha256')
      .update(
        JSON.stringify(
          [
            logId,
            goldMode,
            items.map((item) => [
              item.kind,
              item.side,
              item.userId ?? null,
              item.allianceId ?? null,
              item.recorded,
              item.applied,
              item.status,
              item.note ?? null,
              item.vars,
              // `_`-prefixed payload keys are volatile and never fingerprinted.
              Object.fromEntries(
                Object.entries(item.payload).filter(
                  ([key]) => !key.startsWith('_'),
                ),
              ),
            ]),
            reads,
          ],
          (_key, value) =>
            typeof value === 'bigint' ? `${value.toString()}n` : value,
        ),
      )
      .digest('hex'),
  };
  return {
    plan,
    log: {
      id: log.id,
      attackerId: attacker.id,
      defenderId: defender.id,
      stats,
    },
  };
}

interface VoidLog {
  id: number;
  attackerId: number;
  defenderId: number;
  stats: Record<string, unknown>;
}

const unitRowsFromGrants = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((entry) => asRecord(entry))
    .filter((row) => typeof row.unitType === 'string' && num(row.quantity) > 0)
    .map((row) => ({
      type: String(row.unitType),
      quantity: num(row.quantity),
    }));

/** Read-only plan for the admin dialog. */
export async function previewBattleVoid(
  logId: number,
  goldMode: VoidGoldMode = 'full',
): Promise<VoidPlan> {
  return prisma.$transaction(
    async (tx) => (await computeVoidPlan(tx, logId, goldMode)).plan,
  );
}

const OPERATION_ORDER = [
  'GOLD_ATTACKER',
  'FORCE_CUT_PENDING',
  'FORCE_CUT_SETTLED',
  'LOAN_REPAYMENT',
  'REANIMATED_REMOVE',
  'CAPTIVE_CONVERTED_REMOVE',
  'CAPTIVE_ESCAPED_CITIZENS',
  'CAPTIVE_RELEASE',
  'WOUNDED_RELEASE',
  'UNITS_RESTORE',
  'CONTRACT_RESTORE',
  'CONTRACT_GOLD',
  'GOLD_DEFENDER',
  'CAPTIVE_RANSOM_CLAW',
  'CAPTIVE_RANSOM_REFUND',
];

const stale = () =>
  new BattleVoidError(
    409,
    'STALE_PLAN',
    'The players changed while the void was being applied; preview it again',
  );

async function applyItem(
  tx: Tx,
  item: VoidItem,
  context: { logId: number; key: string; actorId: number; attackerId: number },
) {
  const { payload } = item;
  const amount = () => big(payload.amount);
  switch (item.kind) {
    case 'GOLD_ATTACKER':
    case 'CAPTIVE_RANSOM_CLAW': {
      const hand = big(payload.hand);
      const bank = big(payload.bank);
      if (hand > 0n || bank > 0n) {
        const claimed = await tx.users.updateMany({
          where: {
            id: item.userId,
            gold: { gte: hand },
            gold_in_bank: { gte: bank },
          },
          data: {
            gold: { decrement: hand },
            gold_in_bank: { decrement: bank },
          },
        });
        if (claimed.count !== 1) throw stale();
      }
      // Banked gold leaves the bank for good: leave a trail for it.
      if (bank > 0n)
        await tx.bank_history.create({
          data: {
            gold_amount: bank,
            from_user_id: item.userId as number,
            from_user_account_type: 'BANK',
            to_user_id: 0,
            to_user_account_type: 'VOID',
            date_time: new Date().toISOString(),
            history_type: 'WAR_SPOILS_VOID_BANK',
            stats: { type: 'ATTACK_VOID', attackID: context.logId },
          },
        });
      return;
    }
    case 'GOLD_DEFENDER':
      await tx.users.update({
        where: { id: item.userId },
        data: { gold: { increment: amount() } },
      });
      return;
    case 'FORCE_CUT_PENDING': {
      const claimed = await tx.forceEvent.updateMany({
        where: { id: num(payload.eventId), action: 'PILLAGE_PENDING' },
        data: { action: 'PILLAGE_VOIDED' },
      });
      if (claimed.count !== 1) throw stale();
      return;
    }
    case 'FORCE_CUT_SETTLED': {
      const allianceId = num(payload.allianceId);
      const claw = amount();
      if (claw > 0n) {
        const debited = await tx.alliances.updateMany({
          where: { id: allianceId, gold_in_bank: { gte: claw } },
          data: { gold_in_bank: { decrement: claw } },
        });
        if (debited.count !== 1) throw stale();
        await tx.alliance_bank_history.create({
          data: {
            alliance_id: allianceId,
            transaction_type: 'WITHDRAWAL',
            amount: claw,
            performed_by_user_id: context.actorId,
            related_user_id: context.attackerId,
            notes: `Battle #${context.logId} voided: pillage contribution reversed`,
          },
        });
      }
      await tx.forceEvent.create({
        data: {
          operationKey: `force-tax-void:${context.key}:${allianceId}`,
          allianceId,
          actorId: context.actorId,
          action: 'PILLAGE_VOIDED',
          gold: claw,
          details: {
            battleId: context.logId,
            sourceEventId: num(payload.eventId),
          },
        },
      });
      return;
    }
    case 'LOAN_REPAYMENT': {
      const loanId = num(payload.loanId);
      const allianceId = num(payload.allianceId);
      const reinstate = big(payload.reinstate);
      const pendingTake = big(payload.pendingTake);
      const bankTake = big(payload.bankTake);
      const loan = await tx.alliance_loans.findUniqueOrThrow({
        where: { id: loanId },
      });
      const updated = await tx.alliance_loans.updateMany({
        where: { id: loanId, amount_repaid: { gte: reinstate } },
        data: {
          amount_repaid: { decrement: reinstate },
          pending_treasury_credit: { decrement: pendingTake },
          ...(loan.status === 'REPAID' && reinstate > 0n
            ? { status: 'ACTIVE', closed_at: null }
            : {}),
        },
      });
      if (updated.count !== 1) throw stale();
      if (bankTake > 0n) {
        const debited = await tx.alliances.updateMany({
          where: { id: allianceId, gold_in_bank: { gte: bankTake } },
          data: { gold_in_bank: { decrement: bankTake } },
        });
        if (debited.count !== 1) throw stale();
        await tx.alliance_bank_history.create({
          data: {
            alliance_id: allianceId,
            transaction_type: 'WITHDRAWAL',
            amount: bankTake,
            performed_by_user_id: context.actorId,
            related_user_id: loan.borrower_id,
            notes: `Battle #${context.logId} voided: loan repayment reversed`,
          },
        });
      }
      return;
    }
    case 'CAPTIVE_ESCAPED_CITIZENS': {
      const quantity = num(payload.quantity);
      if (quantity <= 0) return;
      const removed = await tx.userUnit.updateMany({
        where: {
          userId: item.userId,
          type: 'CITIZEN',
          level: 1,
          isMercenary: false,
          quantity: { gte: quantity },
        },
        data: { quantity: { decrement: quantity } },
      });
      if (removed.count !== 1) throw stale();
      return;
    }
    case 'CAPTIVE_RANSOM_REFUND':
      await tx.users.update({
        where: { id: item.userId },
        data: { gold: { increment: amount() } },
      });
      return;
    case 'CAPTIVE_CONVERTED_REMOVE':
    case 'REANIMATED_REMOVE': {
      const quantity = num(payload.quantity);
      if (quantity <= 0) return;
      const removed = await tx.userUnit.updateMany({
        where: {
          userId: item.userId,
          type: String(payload.type) as never,
          level: payload.level == null ? 1 : num(payload.level),
          isMercenary: false,
          quantity: { gte: quantity },
        },
        data: { quantity: { decrement: quantity } },
      });
      if (removed.count !== 1) throw stale();
      await tx.userUnit.deleteMany({
        where: { userId: item.userId, quantity: { lte: 0 } },
      });
      return;
    }
    case 'REANIMATION_COUNTER':
      await tx.users.update({
        where: { id: item.userId },
        data: { reanimated_today: { decrement: num(payload.amount) } },
      });
      return;
    case 'SANCTUARY_COUNTER':
      await tx.users.update({
        where: { id: item.userId },
        data: { sanctuary_recovered_today: { decrement: num(payload.amount) } },
      });
      return;
    case 'CAPTIVE_RELEASE': {
      if (item.status === 'not_reversed') return;
      const captiveId = num(payload.captiveId);
      const removed = await tx.captive.deleteMany({ where: { id: captiveId } });
      if (removed.count !== 1) throw stale();
      await tx.captiveEvent.create({
        data: {
          captorId: context.attackerId,
          sourceId: item.userId,
          kind: 'RELEASED',
          unitType: String(payload.type) as never,
          unitLevel: num(payload.level),
          quantity: num(payload.quantity),
          operationKey: `battle-void:${context.logId}:captive:${captiveId}`,
          details: { battleId: context.logId, reason: 'battle voided' },
        },
      });
      return;
    }
    case 'WOUNDED_RELEASE': {
      const quantity = num(payload.quantity);
      if (quantity <= 0) return;
      const row = await tx.users.findUniqueOrThrow({
        where: { id: item.userId },
        select: { wounded_units: true },
      });
      const pool = (
        Array.isArray(row.wounded_units) ? row.wounded_units : []
      ).map((entry) => ({ ...asRecord(entry) }));
      const target = pool.find(
        (entry) =>
          entry.type === payload.type &&
          num(entry.level) === num(payload.level) &&
          !!entry.isMercenary === !!payload.isMercenary &&
          (entry.forceContractId == null
            ? null
            : num(entry.forceContractId)) ===
            (payload.forceContractId ?? null) &&
          num(entry.quantity) >= quantity,
      );
      if (!target) throw stale();
      target.quantity = num(target.quantity) - quantity;
      await tx.users.update({
        where: { id: item.userId },
        data: {
          wounded_units: pool.filter(
            (entry) => num(entry.quantity) > 0,
          ) as unknown as Prisma.InputJsonValue,
        },
      });
      return;
    }
    case 'UNITS_RESTORE': {
      const quantity = num(payload.quantity);
      await tx.userUnit.upsert({
        where: {
          userId_type_level_isMercenary: {
            userId: item.userId as number,
            type: String(payload.type) as never,
            level: num(payload.level),
            isMercenary: !!payload.isMercenary,
          },
        },
        update: { quantity: { increment: quantity } },
        create: {
          userId: item.userId as number,
          type: String(payload.type) as never,
          level: num(payload.level),
          isMercenary: !!payload.isMercenary,
          quantity,
        },
      });
      return;
    }
    case 'CONTRACT_RESTORE': {
      const quantity = num(payload.quantity);
      if (quantity <= 0) return;
      await tx.forceContract.update({
        where: { id: num(payload.contractId) },
        data: {
          survivingQuantity: { increment: quantity },
          ...(payload.reactivate ? { status: 'ACTIVE', closedAt: null } : {}),
        },
      });
      await tx.forceEvent.create({
        data: {
          operationKey: `battle-void:${context.logId}:contract:${num(payload.contractId)}`,
          contractId: num(payload.contractId),
          actorId: context.actorId,
          action: 'CASUALTIES_VOIDED',
          quantity,
          details: { battleId: context.logId },
        },
      });
      return;
    }
    case 'CONTRACT_GOLD':
      await tx.users.update({
        where: { id: item.userId },
        data: { gold: { increment: amount() } },
      });
      await tx.forceEvent.create({
        data: {
          operationKey: `battle-void:${context.logId}:contract-gold:${num(payload.contractId)}`,
          contractId: num(payload.contractId),
          actorId: context.actorId,
          action: 'CASUALTIES_VOIDED',
          quantity: 0,
          gold: amount(),
          details: {
            battleId: context.logId,
            unitsCompensatedAsGold: num(payload.quantity),
          },
        },
      });
      return;
    case 'FORT_HP':
      await tx.users.update({
        where: { id: item.userId },
        data: { fort_hitpoints: { increment: num(payload.amount) } },
      });
      return;
    case 'TURNS':
      await tx.users.update({
        where: { id: item.userId },
        data: { attack_turns: { increment: num(payload.amount) } },
      });
      return;
    case 'STAMINA': {
      // Add to the projected balance, as battles spend it (stored stamina
      // lags behind by whatever has recovered since the last write).
      const row = await tx.users.findUniqueOrThrow({
        where: { id: item.userId },
        select: { stamina: true, maxStamina: true, staminaUpdatedAt: true },
      });
      const projected = projectStamina(
        row,
        (await getRuntimeConfig(tx)).stamina ?? DEFAULT_STAMINA_RULES,
      );
      await tx.users.update({
        where: { id: item.userId },
        data: {
          stamina: Math.min(
            projected.maxStamina,
            projected.stamina + num(payload.amount),
          ),
          staminaUpdatedAt: projected.staminaUpdatedAt,
        },
      });
      return;
    }
    case 'XP':
      await tx.users.update({
        where: { id: item.userId },
        data: { experience: { decrement: num(payload.amount) } },
      });
      return;
    case 'COUNTER': {
      const row = await tx.users.findUniqueOrThrow({
        where: { id: item.userId },
        select: { stats: true },
      });
      const stats = (Array.isArray(row.stats) ? row.stats : []).map(
        (entry) => ({
          ...asRecord(entry),
        }),
      );
      const entry = stats.find(
        (candidate) =>
          candidate.type === payload.type &&
          candidate.subtype === payload.subtype,
      );
      if (entry && num(entry.stat) > 0) {
        entry.stat = num(entry.stat) - 1;
        // A record that returns to zero goes back to "never fought".
        await tx.users.update({
          where: { id: item.userId },
          data: {
            stats: stats.filter(
              (candidate) => num(candidate.stat) > 0,
            ) as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return;
    }
    case 'MORALE':
      await tx.users.update({
        where: { id: item.userId },
        data: { kingdom_morale: num(payload.next) },
      });
      return;
    case 'PRESSURE':
      await tx.users.update({
        where: { id: item.userId },
        data: { defense_pressure_today: num(payload.next) },
      });
      break;
    default:
      break;
  }
}

const rank = (kind: string) => {
  const index = OPERATION_ORDER.indexOf(kind);
  return index < 0 ? OPERATION_ORDER.length : index;
};

function playerMessage(
  locale: string,
  vars: {
    id: number;
    opponent: string;
    reason: string;
    gold: string;
    units: string;
    xp: string;
  },
) {
  const language = locale.split(/[-_]/)[0];
  const copy = (
    language === 'es' ? es : language === 'de' ? de : en
  ) as typeof en;
  const fill = (template: string) =>
    template.replace(/{{(\w+)}}/g, (_, key: string) =>
      String(vars[key as keyof typeof vars] ?? ''),
    );
  return {
    subject: fill(copy.void.message.subject),
    body: fill(copy.void.message.body),
  };
}

/**
 * The notice reaches the player where they read messages: a private
 * conversation with the acting administrator, created inside the void. It
 * only ever uses a conversation whose participants are exactly the admin and
 * the recipient. An administrator who fought in the battle is told on screen,
 * not through a conversation with themselves.
 */
async function sendVoidNotice(
  tx: Tx,
  actorId: number,
  userId: number,
  message: { subject: string; body: string },
): Promise<'chat' | 'self'> {
  if (userId === actorId) return 'self';
  const rooms = await tx.chatRoom.findMany({
    where: {
      name: null,
      allianceId: null,
      AND: [
        { participants: { some: { userId } } },
        { participants: { some: { userId: actorId } } },
      ],
    },
    select: { id: true, participants: { select: { userId: true } } },
    orderBy: { id: 'asc' },
  });
  let roomId = rooms.find(
    (room) =>
      room.participants.length === 2 &&
      room.participants.every(
        (participant) =>
          participant.userId === userId || participant.userId === actorId,
      ),
  )?.id;
  if (!roomId) {
    const room = await tx.chatRoom.create({
      data: {
        createdById: actorId,
        isPrivate: true,
        participants: {
          create: [
            { userId: actorId, role: 'ADMIN' },
            { userId, role: 'MEMBER' },
          ],
        },
      },
      select: { id: true },
    });
    roomId = room.id;
  }
  await tx.chatMessage.create({
    data: {
      roomId,
      senderId: actorId,
      content: `${message.subject}\n\n${message.body}`,
    },
  });
  return 'chat';
}

/**
 * Errors that mean "someone else got there first": a serialization failure
 * (P2034 / SQLSTATE 40001, which raw lock queries surface as P2010), a unique
 * violation, or a deadlock (40P01). They are 409s, never 500s.
 */
export function isVoidConflict(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  const text = String((error as { message?: unknown })?.message ?? '');
  return (
    code === 'P2034' ||
    code === 'P2002' ||
    text.includes('40001') ||
    text.includes('40P01') ||
    text.toLowerCase().includes('deadlock') ||
    text.includes('TransactionWriteConflict')
  );
}

export interface VoidResult {
  plan: VoidPlan;
  voidedAt: Date;
}

/**
 * Voids a battle: one Serializable transaction, row locks on the log, any
 * alliances touched and both players, then the previewed plan is recomputed
 * and applied. The log itself is not rewritten; the void is a separate record.
 */
export async function voidBattle(input: {
  logId: number;
  actorId: number;
  ip?: string;
  reason: string;
  goldMode: VoidGoldMode;
  planHash: string;
}): Promise<VoidResult> {
  const reason = input.reason.trim();
  if (!reason || reason.length > VOID_REASON_MAX_LENGTH)
    throw new BattleVoidError(422, 'REASON_REQUIRED', 'A reason is required');
  try {
    return await prisma.$transaction(
      async (tx) => {
        await lockEraLifecycleShared(tx);
        // Lock order: the log, alliances by id, then both players by id.
        await tx.$queryRaw`SELECT id FROM attack_log WHERE id = ${input.logId} FOR UPDATE`;
        const allianceIds = await touchedAllianceIds(tx, input.logId);
        if (allianceIds.length)
          await tx.$queryRaw`SELECT id FROM alliances WHERE id IN (${Prisma.join(allianceIds)}) ORDER BY id FOR UPDATE`;
        const header = await tx.attack_log.findUnique({
          where: { id: input.logId },
          select: { attacker_id: true, defender_id: true, voidedAt: true },
        });
        if (!header)
          throw new BattleVoidError(404, 'NOT_FOUND', 'Battle not found');
        if (header.voidedAt)
          throw new BattleVoidError(
            409,
            'ALREADY_VOIDED',
            'This battle has already been voided',
          );
        const first = Math.min(header.attacker_id, header.defender_id);
        const second = Math.max(header.attacker_id, header.defender_id);
        await tx.$queryRaw`SELECT id FROM users WHERE id IN (${first}, ${second}) ORDER BY id FOR UPDATE`;

        const { plan, log } = await computeVoidPlan(
          tx,
          input.logId,
          input.goldMode,
        );
        if (plan.hash !== input.planHash)
          throw new BattleVoidError(
            409,
            'STALE_PLAN',
            'The players changed since the preview; preview it again',
          );
        const { stats } = log;
        const key =
          typeof stats.forcePillageKey === 'string'
            ? stats.forcePillageKey
            : '';
        const before = await snapshotState(tx, plan);

        const ordered = [...plan.items].sort(
          (a, b) => rank(a.kind) - rank(b.kind),
        );
        for (const item of ordered)
          await applyItem(tx, item, {
            logId: input.logId,
            key,
            actorId: input.actorId,
            attackerId: plan.attackerId,
          });
        // Casualties changed rosters and contract survivors.
        await recomputeStoredStatsInTx(tx, plan.attackerId);
        await recomputeStoredStatsInTx(tx, plan.defenderId);
        const after = await snapshotState(tx, plan);

        const goldDefender = plan.items.find(
          (item) => item.kind === 'GOLD_DEFENDER',
        );
        const attackerClaw = plan.items.find(
          (item) => item.kind === 'GOLD_ATTACKER',
        );
        if (goldDefender && big(goldDefender.applied) > 0n)
          await tx.bank_history.create({
            data: {
              gold_amount: big(goldDefender.applied),
              from_user_id: plan.attackerId,
              from_user_account_type: 'HAND',
              to_user_id: plan.defenderId,
              to_user_account_type: 'HAND',
              date_time: new Date().toISOString(),
              history_type: 'WAR_SPOILS_VOID',
              stats: { type: 'ATTACK_VOID', attackID: input.logId },
            },
          });

        const voidedAt = new Date();
        const marked = await tx.attack_log.updateMany({
          where: { id: input.logId, voidedAt: null },
          data: { voidedAt, voidedById: input.actorId, voidReason: reason },
        });
        if (marked.count !== 1)
          throw new BattleVoidError(
            409,
            'ALREADY_VOIDED',
            'This battle has already been voided',
          );

        const shortfalls = plan.items
          .filter((item) => item.status === 'capped')
          .map((item) => ({
            kind: item.kind,
            side: item.side,
            recorded: item.recorded,
            applied: item.applied,
            note: item.note ?? null,
          }));
        const notReversed = plan.items
          .filter((item) => item.status === 'not_reversed')
          .map((item) => ({
            kind: item.kind,
            side: item.side,
            note: item.note ?? null,
          }));
        await tx.attackLogVoid.create({
          data: {
            attackLogId: input.logId,
            battleId: input.logId,
            actorId: input.actorId,
            reason,
            planHash: plan.hash,
            goldMode: plan.goldMode,
            ledger: {
              items: plan.items,
              // Events this void settled; no other void may reuse them.
              consumedEvents: plan.items
                .map((item) => item.payload.eventId)
                .filter((value): value is number => typeof value === 'number'),
              before,
              after,
            } as unknown as Prisma.InputJsonValue,
            shortfalls: shortfalls as unknown as Prisma.InputJsonValue,
            notReversed: notReversed as unknown as Prisma.InputJsonValue,
          },
        });

        // Both participants hear about it, in their own language.
        const notices: Array<{ userId: number; delivery: string }> = [];
        for (const side of ['attacker', 'defender'] as const) {
          const userId =
            side === 'attacker' ? plan.attackerId : plan.defenderId;
          const opponent =
            side === 'attacker' ? plan.defenderName : plan.attackerName;
          const mine = plan.items.filter((item) => item.userId === userId);
          const gold = mine
            .filter(
              (item) =>
                item.kind === 'GOLD_DEFENDER' ||
                item.kind === 'CONTRACT_GOLD' ||
                item.kind === 'CAPTIVE_RANSOM_REFUND',
            )
            .reduce(
              (sum, item) =>
                sum +
                big(
                  item.kind === 'CONTRACT_GOLD'
                    ? item.payload.amount
                    : item.applied,
                ),
              0n,
            );
          const goldLost = mine
            .filter(
              (item) =>
                item.kind === 'GOLD_ATTACKER' ||
                item.kind === 'CAPTIVE_RANSOM_CLAW',
            )
            .reduce((sum, item) => sum + big(item.applied), 0n);
          const units = mine
            .filter(
              (item) =>
                item.kind === 'UNITS_RESTORE' ||
                item.kind === 'CONTRACT_RESTORE',
            )
            .reduce((sum, item) => sum + num(item.applied), 0);
          const xp = mine
            .filter((item) => item.kind === 'XP')
            .reduce((sum, item) => sum + num(item.applied), 0);
          const owner = await tx.users.findUniqueOrThrow({
            where: { id: userId },
            select: { locale: true },
          });
          const language = owner.locale ?? 'en';
          const net = gold - goldLost;
          const message = playerMessage(language, {
            id: input.logId,
            opponent,
            reason,
            gold: `${net >= 0n ? '+' : '-'}${(net >= 0n ? net : -net).toLocaleString(language.split(/[-_]/)[0])}`,
            units: units.toLocaleString(language.split(/[-_]/)[0]),
            xp: xp.toLocaleString(language.split(/[-_]/)[0]),
          });
          notices.push({
            userId,
            delivery: await sendVoidNotice(tx, input.actorId, userId, message),
          });
        }

        await logActionStrict(
          {
            userId: input.actorId,
            action: 'ADMIN_BATTLE_VOID',
            ip: input.ip,
            targetUserId: plan.defenderId,
            entityType: 'attack_log',
            entityId: input.logId,
            details: {
              attackerId: plan.attackerId,
              defenderId: plan.defenderId,
              reason,
              goldMode: plan.goldMode,
              planHash: plan.hash,
              attackerGoldClawed: attackerClaw?.applied ?? '0',
              defenderGoldCredited: goldDefender?.applied ?? '0',
              before,
              after,
              shortfalls,
              notReversed,
              notices,
            } as unknown as Record<string, unknown>,
          },
          tx,
        );
        return { plan, voidedAt };
      },
      { isolationLevel: 'Serializable', timeout: 30_000, maxWait: 30_000 },
    );
  } catch (error) {
    if (error instanceof BattleVoidError) throw error;
    // A concurrent void (or gameplay write) won the race.
    if (isVoidConflict(error))
      throw new BattleVoidError(
        409,
        'CONFLICT',
        'This battle was changed or voided by someone else; reload it',
      );
    throw error;
  }
}

/** BigInt-safe, JSON-ready copy of anything a snapshot reads. */
const plain = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === 'bigint' ? item.toString() : item,
    ),
  );

/**
 * Every entity and counter the plan can touch, read inside the void's
 * transaction: both players (gold, roster, wounded, win/loss counters,
 * reanimation and sanctuary counters, morale, pressure), every contract,
 * the alliances, loans, captives and force events the items name.
 */
async function snapshotState(tx: Tx, plan: VoidPlan) {
  const out: Record<string, unknown> = {};
  for (const [side, id] of [
    ['attacker', plan.attackerId],
    ['defender', plan.defenderId],
  ] as const) {
    const row = await tx.users.findUniqueOrThrow({
      where: { id },
      select: {
        gold: true,
        experience: true,
        attack_turns: true,
        stamina: true,
        fort_hitpoints: true,
        kingdom_morale: true,
        defense_pressure_today: true,
        reanimated_today: true,
        reanimation_day: true,
        sanctuary_recovered_today: true,
        sanctuary_day: true,
        stats: true,
        UserUnit: {
          select: {
            type: true,
            level: true,
            isMercenary: true,
            quantity: true,
          },
          orderBy: [{ type: 'asc' }, { level: 'asc' }, { isMercenary: 'asc' }],
        },
        wounded_units: true,
        forceContracts: {
          select: {
            id: true,
            kind: true,
            status: true,
            initialQuantity: true,
            survivingQuantity: true,
            closedAt: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    out[side] = {
      gold: row.gold,
      experience: row.experience,
      attackTurns: row.attack_turns,
      stamina: row.stamina,
      fortHitpoints: row.fort_hitpoints,
      kingdomMorale: row.kingdom_morale,
      defensePressure: row.defense_pressure_today,
      reanimation: {
        today: row.reanimated_today,
        day: row.reanimation_day,
      },
      sanctuary: {
        today: row.sanctuary_recovered_today,
        day: row.sanctuary_day,
      },
      winLossCounters: row.stats,
      units: row.UserUnit,
      woundedUnits: row.wounded_units,
      contracts: row.forceContracts,
    };
  }
  const ids = (key: string) =>
    [
      ...new Set(
        plan.items
          .map((item) => item.payload[key])
          .filter((value): value is number => typeof value === 'number'),
      ),
    ].sort((a, b) => a - b);
  const allianceIds = [
    ...new Set(
      plan.items
        .map((item) => item.allianceId)
        .filter((value): value is number => typeof value === 'number'),
    ),
  ].sort((a, b) => a - b);
  out.alliances = await tx.alliances.findMany({
    where: { id: { in: allianceIds } },
    select: { id: true, gold_in_bank: true },
    orderBy: { id: 'asc' },
  });
  out.loans = await tx.alliance_loans.findMany({
    where: { id: { in: ids('loanId') } },
    select: {
      id: true,
      status: true,
      amount_owed: true,
      amount_repaid: true,
      pending_treasury_credit: true,
      closed_at: true,
    },
    orderBy: { id: 'asc' },
  });
  out.captives = await tx.captive.findMany({
    where: { captorId: plan.attackerId, sourceId: plan.defenderId },
    orderBy: { id: 'asc' },
  });
  out.forceEvents = await tx.forceEvent.findMany({
    where: { id: { in: ids('eventId') } },
    select: { id: true, action: true, gold: true },
    orderBy: { id: 'asc' },
  });
  return plain(out);
}
