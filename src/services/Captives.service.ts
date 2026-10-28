import { createHash } from 'crypto';

import {
  CAPTIVE_MAX_DAYS,
  captorRansomShare,
  capturableCombatRows,
  type CapturableFallenRow,
  captureQuantity,
  CONVERT_MIN_HOURS,
  convertCostPerUnit,
  convertReadyAt,
  demotedUnitLevel,
  distributeCaptures,
  DUNGEON_FORT_LEVEL,
  dungeonCapacity,
  ransomPricePerUnit,
  RELEASE_MORALE,
} from '@/constants/Captives';
import { hasFeature } from '@/constants/FeatureUnlocks';
import {
  applyMoraleDelta,
  KINGDOM_MORALE_DEFAULT,
} from '@/constants/KingdomMorale';
import prisma from '@/lib/prisma';
import type { CaptiveEvent, Prisma } from '@/lib/prisma-exports';
import { logError } from '@/utils/logger';

type Tx = Prisma.TransactionClient;

/** Same per-pair transaction budget as the morale pass's transactions. */
const CAPTIVE_TX_OPTIONS = { timeout: 10_000, maxWait: 5_000 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One row of the defender's killed units, as the battle engine records it. */
export type KilledUnitRow = CapturableFallenRow;

/**
 * An expected dungeon refusal (bad terms, a stale row, an empty stack,
 * missing gold): the API route maps it to a 400 with its player-facing
 * message. Anything else thrown by this service is a server fault.
 */
export class DungeonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DungeonError';
  }
}

/** Player-facing outcome of a dungeon action (gold always as a string). */
export interface CaptiveActionResult {
  action: 'RANSOM' | 'RELEASE' | 'CONVERT';
  captiveId: number;
  unitType: string;
  unitLevel: number;
  quantity: number;
  gold: string;
  captorShare?: string;
  burned?: string;
  toLevel?: number;
  moraleGained?: number;
}

/**
 * Locks the two users rows in ascending id order (the same statement attacks,
 * spy missions and the morale pass use), so a dungeon action can never
 * deadlock a battle touching the same pair.
 */
const lockPair = (tx: Tx, firstId: number, secondId: number) => {
  const low = Math.min(firstId, secondId);
  const high = Math.max(firstId, secondId);
  return tx.$queryRaw`SELECT id FROM users WHERE id IN (${low}, ${high}) ORDER BY id FOR UPDATE`;
};

/** Locks one captive row FOR UPDATE and returns it; null once it is gone. */
const lockCaptive = async (tx: Tx, captiveId: number) => {
  const rows = await tx.$queryRaw<
    Array<{ id: number }>
  >`SELECT id FROM "Captive" WHERE id = ${captiveId} FOR UPDATE`;
  if (rows.length === 0) return null;
  return tx.captive.findUnique({ where: { id: captiveId } });
};

/** Idempotency marker lookup (the operationId pattern the mercenaries use). */
const replayOf = (
  prior: { details?: unknown } | null,
): CaptiveActionResult | null => {
  const result = (prior?.details as { result?: unknown } | null)?.result;
  return result && typeof result === 'object'
    ? (result as CaptiveActionResult)
    : null;
};

/**
 * Re-reads the idempotency marker under (or without) the row locks: a retry
 * racing this transaction may have committed while we waited. Its stored
 * result replays; a stored hash mismatch is refused like the pre-lock check.
 */
const replayForKey = async (
  tx: Tx,
  key: string,
  hash: string,
): Promise<CaptiveActionResult | null> => {
  const prior = await tx.captiveEvent.findUnique({
    where: { operationKey: key },
  });
  if (!prior) return null;
  if ((prior.details as { commandHash?: string } | null)?.commandHash !== hash)
    throw new DungeonError('Operation ID already used for different terms');
  return replayOf(prior);
};

async function operation(
  tx: Tx,
  key: string,
  command: unknown,
): Promise<{ hash: string; prior: CaptiveEvent | null }> {
  const hash = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  const prior = await tx.captiveEvent.findUnique({
    where: { operationKey: key },
  });
  if (
    prior &&
    (prior.details as { commandHash?: string } | null)?.commandHash !== hash
  )
    throw new DungeonError('Operation ID already used for different terms');
  return { hash, prior };
}

/** Adds (or creates) a stack of the source's own units at their original tier. */
const returnUnitsToSource = (
  tx: Tx,
  sourceId: number,
  unitType: string,
  unitLevel: number,
  quantity: number,
) =>
  tx.userUnit.upsert({
    where: {
      userId_type_level_isMercenary: {
        userId: sourceId,
        type: unitType as Prisma.CaptiveCreateInput['unitType'],
        level: unitLevel,
        isMercenary: false,
      },
    },
    update: { quantity: { increment: quantity } },
    create: {
      userId: sourceId,
      type: unitType as Prisma.CaptiveCreateInput['unitType'],
      level: unitLevel,
      quantity,
      isMercenary: false,
    },
  });

/** Encapsulates dungeon captives (#210): capture, ransom, release, conversion and escape. */
export class CaptiveService {
  /**
   * Capture hook run inside the battle transaction: 10% of the defender's
   * killed combat units (rounded once on the battle total, split across the
   * killed rows largest-remainder) move into the captor's dungeon instead of
   * dying. Captures beyond the dungeon's free capacity die as before. The
   * caller has already established eligibility (attacker won, fort breached,
   * dungeon unlocked, defender neither protected nor exempt); this method
   * never changes the battle's outcome or loot.
   * @returns how many units were actually taken captive.
   */
  static async captureFromBattle(
    tx: Tx,
    input: {
      captorId: number;
      sourceId: number;
      eraId: number | null;
      captorFortLevel: number;
      killedUnits: KilledUnitRow[];
      now?: Date;
    },
  ): Promise<number> {
    const now = input.now ?? new Date();
    // A captor without a dungeon holds nobody, even if the battle hook is
    // called by mistake: capacity below the unlock level is zero anyway.
    if (input.captorFortLevel < DUNGEON_FORT_LEVEL) return 0;
    const combatRows = capturableCombatRows(input.killedUnits);
    if (combatRows.length === 0) return 0;
    const killedTotal = combatRows.reduce((sum, row) => sum + row.quantity, 0);
    const wanted = captureQuantity(killedTotal);
    if (wanted <= 0) return 0;
    const held = await tx.captive.aggregate({
      where: { captorId: input.captorId },
      _sum: { quantity: true },
    });
    const freeSpace = Math.max(
      0,
      dungeonCapacity(input.captorFortLevel) - Number(held._sum.quantity ?? 0),
    );
    const captured = Math.min(wanted, freeSpace);
    if (captured <= 0) return 0;

    const takes = distributeCaptures(
      combatRows.map((row) => row.quantity),
      captured,
    );
    const events: Array<Prisma.CaptiveEventCreateManyInput> = [];
    let taken = 0;
    for (let index = 0; index < combatRows.length; index += 1) {
      const quantity = takes[index];
      if (quantity <= 0) continue;
      const row = combatRows[index];
      await tx.captive.create({
        data: {
          captorId: input.captorId,
          sourceId: input.sourceId,
          unitType: row.type as Prisma.CaptiveCreateInput['unitType'],
          unitLevel: row.level,
          quantity,
          capturedAt: now,
          eraId: input.eraId,
        },
      });
      taken += quantity;
      events.push({
        captorId: input.captorId,
        sourceId: input.sourceId,
        eraId: input.eraId,
        kind: 'CAPTURED',
        unitType: row.type as Prisma.CaptiveEventCreateManyInput['unitType'],
        unitLevel: row.level,
        quantity,
      });
    }
    if (events.length > 0) await tx.captiveEvent.createMany({ data: events });
    return taken;
  }

  /**
   * Ransom: the SOURCE buys its own troops back, paying 40% of their base
   * cost. The captor receives only half of it; the rest is burned so ransoms
   * can never be used to funnel gold between kingdoms.
   */
  static async ransom(
    input: { userId: number; captiveId: number; operationId: string },
    now: Date = new Date(),
  ): Promise<CaptiveActionResult> {
    return prisma.$transaction(async (tx) => {
      // Idempotency first: a retried command replays its stored outcome, and
      // a reused operationId with different terms is refused outright.
      const { hash, prior } = await operation(tx, input.operationId, {
        action: 'RANSOM',
        ...input,
      });
      if (prior) {
        const replay = replayOf(prior);
        if (replay) return replay;
      }

      // Cheap peek for the captor id so both rows can be locked together.
      // A missing row may just mean this very command already committed
      // (a racing retry): replay before refusing.
      const peek = await tx.captive.findUnique({
        where: { id: input.captiveId },
        select: { captorId: true, sourceId: true },
      });
      if (!peek) {
        const replay = await replayForKey(tx, input.operationId, hash);
        if (replay) return replay;
        throw new DungeonError('These captives are no longer held');
      }
      if (peek.sourceId !== input.userId)
        throw new DungeonError('These captives are not yours to ransom');

      await lockPair(tx, input.userId, peek.captorId);

      const row = await lockCaptive(tx, input.captiveId);
      // Re-check under the locks: a retry with the same operationId may have
      // committed while we waited for them, deleting the row — its stored
      // result replays instead of double-charging or refusing.
      const replay = await replayForKey(tx, input.operationId, hash);
      if (replay) return replay;
      if (!row) throw new DungeonError('These captives are no longer held');
      // A non-positive stack (corrupt or legacy data) must never mint gold:
      // a negative quantity would turn the ransom into a credit.
      if (row.quantity <= 0)
        throw new DungeonError('This captive stack is invalid');
      const [source, captor] = await Promise.all([
        tx.users.findUnique({
          where: { id: row.sourceId },
          select: { currentEraId: true },
        }),
        tx.users.findUnique({
          where: { id: row.captorId },
          select: { currentEraId: true, display_name: true },
        }),
      ]);
      // Cross-era captives are refused: both kingdoms must still play the era
      // the capture happened in.
      if (
        row.eraId === null ||
        row.eraId !== source?.currentEraId ||
        row.eraId !== captor?.currentEraId
      )
        throw new DungeonError('These captives are from an earlier era');

      const price =
        ransomPricePerUnit(row.unitType, row.unitLevel) * BigInt(row.quantity);
      const share = captorRansomShare(price);
      const burned = price - share;
      const paid = await tx.users.updateMany({
        where: { id: row.sourceId, gold: { gte: price } },
        data: { gold: { decrement: price } },
      });
      if (paid.count !== 1) throw new DungeonError('Insufficient gold');
      await tx.users.update({
        where: { id: row.captorId },
        data: { gold: { increment: share } },
      });
      await returnUnitsToSource(
        tx,
        row.sourceId,
        row.unitType,
        row.unitLevel,
        row.quantity,
      );
      await tx.captive.delete({ where: { id: row.id } });

      const result: CaptiveActionResult = {
        action: 'RANSOM',
        captiveId: row.id,
        unitType: row.unitType,
        unitLevel: row.unitLevel,
        quantity: row.quantity,
        gold: price.toString(),
        captorShare: share.toString(),
        burned: burned.toString(),
      };
      await tx.captiveEvent.create({
        data: {
          captorId: row.captorId,
          sourceId: row.sourceId,
          eraId: row.eraId,
          kind: 'RANSOMED',
          unitType: row.unitType,
          unitLevel: row.unitLevel,
          quantity: row.quantity,
          gold: price,
          operationKey: input.operationId,
          details: { commandHash: hash, result },
        },
      });
      await tx.bank_history.create({
        data: {
          gold_amount: share,
          from_user_id: row.sourceId,
          from_user_account_type: 'HAND',
          to_user_id: row.captorId,
          to_user_account_type: 'HAND',
          date_time: now,
          history_type: 'DUNGEON',
          stats: {
            action: 'RANSOM',
            captiveEventUnitType: row.unitType,
            quantity: row.quantity,
            totalPaid: price.toString(),
            captorShare: share.toString(),
            burned: burned.toString(),
            message: `${row.quantity} ransomed captives returned home; ${burned.toString()} gold of the ransom was burned.`,
          },
        },
      });
      return result;
    }, CAPTIVE_TX_OPTIONS);
  }

  /**
   * Release: the captor frees the captives for nothing; they return to the
   * source at their original tier and the source gains +2 morale (capped).
   */
  static async release(
    input: { userId: number; captiveId: number; operationId: string },
    now: Date = new Date(),
  ): Promise<CaptiveActionResult> {
    return prisma.$transaction(async (tx) => {
      // Idempotency first: a retried command replays its stored outcome, and
      // a reused operationId with different terms is refused outright.
      const { hash, prior } = await operation(tx, input.operationId, {
        action: 'RELEASE',
        ...input,
      });
      if (prior) {
        const replay = replayOf(prior);
        if (replay) return replay;
      }

      const peek = await tx.captive.findUnique({
        where: { id: input.captiveId },
        select: { captorId: true, sourceId: true },
      });
      if (!peek) {
        // The row may be gone because this very command already committed
        // (a racing retry): replay before refusing.
        const replay = await replayForKey(tx, input.operationId, hash);
        if (replay) return replay;
        throw new DungeonError('These captives are no longer held');
      }
      if (peek.captorId !== input.userId)
        throw new DungeonError('You do not hold these captives');

      await lockPair(tx, input.userId, peek.sourceId);

      const row = await lockCaptive(tx, input.captiveId);
      // Re-check under the locks: a retry with the same operationId may have
      // committed while we waited for them, deleting the row — its stored
      // result replays instead of double-releasing or refusing.
      const replay = await replayForKey(tx, input.operationId, hash);
      if (replay) return replay;
      if (!row) throw new DungeonError('These captives are no longer held');
      if (row.quantity <= 0)
        throw new DungeonError('This captive stack is invalid');
      const [captor, source] = await Promise.all([
        tx.users.findUnique({
          where: { id: row.captorId },
          select: { currentEraId: true },
        }),
        tx.users.findUnique({
          where: { id: row.sourceId },
          select: { currentEraId: true, kingdom_morale: true },
        }),
      ]);
      if (
        row.eraId === null ||
        row.eraId !== captor?.currentEraId ||
        row.eraId !== source?.currentEraId
      )
        throw new DungeonError('These captives are from an earlier era');

      await returnUnitsToSource(
        tx,
        row.sourceId,
        row.unitType,
        row.unitLevel,
        row.quantity,
      );
      const moraleBefore = Number(
        source.kingdom_morale ?? KINGDOM_MORALE_DEFAULT,
      );
      const moraleAfter = applyMoraleDelta(moraleBefore, RELEASE_MORALE);
      await tx.users.update({
        where: { id: row.sourceId },
        data: { kingdom_morale: moraleAfter },
      });
      await tx.captive.delete({ where: { id: row.id } });

      const result: CaptiveActionResult = {
        action: 'RELEASE',
        captiveId: row.id,
        unitType: row.unitType,
        unitLevel: row.unitLevel,
        quantity: row.quantity,
        gold: '0',
        moraleGained: Math.max(0, moraleAfter - moraleBefore),
      };
      await tx.captiveEvent.create({
        data: {
          captorId: row.captorId,
          sourceId: row.sourceId,
          eraId: row.eraId,
          kind: 'RELEASED',
          unitType: row.unitType,
          unitLevel: row.unitLevel,
          quantity: row.quantity,
          gold: 0n,
          operationKey: input.operationId,
          details: { commandHash: hash, result },
        },
      });
      await tx.bank_history.create({
        data: {
          gold_amount: 0n,
          from_user_id: row.captorId,
          from_user_account_type: 'HAND',
          to_user_id: row.sourceId,
          to_user_account_type: 'HAND',
          date_time: now,
          history_type: 'DUNGEON',
          stats: {
            action: 'RELEASE',
            quantity: row.quantity,
            moraleGained: result.moraleGained,
            message: `${row.quantity} captives were released and returned home.`,
          },
        },
      });
      return result;
    }, CAPTIVE_TX_OPTIONS);
  }

  /**
   * Convert: after 72 hours in the dungeon the captor may press captives into
   * its own army, paying 25% of their base cost. Converted units drop to the
   * highest tier of their type the captor's fort has unlocked.
   */
  static async convert(
    input: { userId: number; captiveId: number; operationId: string },
    now: Date = new Date(),
  ): Promise<CaptiveActionResult> {
    return prisma.$transaction(async (tx) => {
      // Idempotency first: a retried command replays its stored outcome, and
      // a reused operationId with different terms is refused outright.
      const { hash, prior } = await operation(tx, input.operationId, {
        action: 'CONVERT',
        ...input,
      });
      if (prior) {
        const replay = replayOf(prior);
        if (replay) return replay;
      }

      const peek = await tx.captive.findUnique({
        where: { id: input.captiveId },
        select: { captorId: true, sourceId: true },
      });
      if (!peek) {
        // The row may be gone because this very command already committed
        // (a racing retry): replay before refusing.
        const replay = await replayForKey(tx, input.operationId, hash);
        if (replay) return replay;
        throw new DungeonError('These captives are no longer held');
      }
      if (peek.captorId !== input.userId)
        throw new DungeonError('You do not hold these captives');

      await lockPair(tx, input.userId, peek.sourceId);

      const row = await lockCaptive(tx, input.captiveId);
      // Re-check under the locks: a retry with the same operationId may have
      // committed while we waited for them, deleting the row — its stored
      // result replays instead of double-converting or refusing.
      const replay = await replayForKey(tx, input.operationId, hash);
      if (replay) return replay;
      if (!row) throw new DungeonError('These captives are no longer held');
      if (row.quantity <= 0)
        throw new DungeonError('This captive stack is invalid');
      const captor = await tx.users.findUnique({
        where: { id: row.captorId },
        select: {
          currentEraId: true,
          fort_level: true,
          economy_level: true,
          race: true,
        },
      });
      const source = await tx.users.findUnique({
        where: { id: row.sourceId },
        select: { currentEraId: true },
      });
      if (
        row.eraId === null ||
        row.eraId !== captor?.currentEraId ||
        row.eraId !== source?.currentEraId
      )
        throw new DungeonError('These captives are from an earlier era');
      if (
        !captor ||
        !hasFeature(
          {
            economyLevel: captor.economy_level ?? 0,
            fortLevel: captor.fort_level ?? 0,
            race: captor.race,
          },
          'DUNGEON',
        )
      )
        throw new DungeonError(
          `Conversion requires a fortification of level ${DUNGEON_FORT_LEVEL}`,
        );
      if (convertReadyAt(row.capturedAt).getTime() > now.getTime())
        throw new DungeonError(
          `Captives may be converted after ${CONVERT_MIN_HOURS} hours in the dungeon`,
        );

      const cost =
        convertCostPerUnit(row.unitType, row.unitLevel) * BigInt(row.quantity);
      const paid = await tx.users.updateMany({
        where: { id: row.captorId, gold: { gte: cost } },
        data: { gold: { decrement: cost } },
      });
      if (paid.count !== 1) throw new DungeonError('Insufficient gold');

      const toLevel = demotedUnitLevel(
        row.unitType,
        row.unitLevel,
        captor.fort_level ?? 0,
      );
      await tx.userUnit.upsert({
        where: {
          userId_type_level_isMercenary: {
            userId: row.captorId,
            type: row.unitType,
            level: toLevel,
            isMercenary: false,
          },
        },
        update: { quantity: { increment: row.quantity } },
        create: {
          userId: row.captorId,
          type: row.unitType,
          level: toLevel,
          quantity: row.quantity,
          isMercenary: false,
        },
      });
      await tx.captive.delete({ where: { id: row.id } });

      const result: CaptiveActionResult = {
        action: 'CONVERT',
        captiveId: row.id,
        unitType: row.unitType,
        unitLevel: row.unitLevel,
        quantity: row.quantity,
        gold: cost.toString(),
        toLevel,
      };
      await tx.captiveEvent.create({
        data: {
          captorId: row.captorId,
          sourceId: row.sourceId,
          eraId: row.eraId,
          kind: 'CONVERTED',
          unitType: row.unitType,
          unitLevel: row.unitLevel,
          quantity: row.quantity,
          gold: cost,
          operationKey: input.operationId,
          details: { commandHash: hash, result },
        },
      });
      await tx.bank_history.create({
        data: {
          gold_amount: cost,
          from_user_id: row.captorId,
          from_user_account_type: 'HAND',
          to_user_id: row.captorId,
          to_user_account_type: 'HAND',
          date_time: now,
          history_type: 'DUNGEON',
          stats: {
            action: 'CONVERT',
            quantity: row.quantity,
            cost: cost.toString(),
            fromLevel: row.unitLevel,
            toLevel,
            message: `${row.quantity} captives joined your army as level ${toLevel} ${row.unitType}.`,
          },
        },
      });
      return result;
    }, CAPTIVE_TX_OPTIONS);
  }

  /**
   * Daily escape pass (run next to the morale/desertion job): captives held
   * longer than 7 days — and every captive of a captor who lost the dungeon —
   * escapes back to its source as CITIZEN units. Each row is its own
   * transaction locking the pair in id order, so one bad row never blocks the
   * rest of the daily run. (Era rollovers clear the whole table under the era
   * lifecycle lock first, so a row that vanished is a strict no-op here.)
   */
  static async processDailyCaptives(now: Date = new Date()): Promise<{
    escaped: number;
  }> {
    const escapeDeadline = new Date(now.getTime() - CAPTIVE_MAX_DAYS * DAY_MS);
    const candidates = await prisma.captive.findMany({
      where: {
        OR: [
          { capturedAt: { lte: escapeDeadline } },
          { captor: { fort_level: { lt: DUNGEON_FORT_LEVEL } } },
        ],
      },
      orderBy: { id: 'asc' },
      select: { id: true, captorId: true, sourceId: true },
    });
    let escaped = 0;
    for (const candidate of candidates) {
      try {
        escaped += await prisma.$transaction(async (tx) => {
          await lockPair(tx, candidate.captorId, candidate.sourceId);
          const row = await lockCaptive(tx, candidate.id);
          if (!row) return 0;
          const captor = await tx.users.findUnique({
            where: { id: row.captorId },
            select: {
              fort_level: true,
              economy_level: true,
              race: true,
            },
          });
          const overdue = row.capturedAt.getTime() <= escapeDeadline.getTime();
          const lostDungeon = !(
            captor &&
            hasFeature(
              {
                economyLevel: captor.economy_level ?? 0,
                fortLevel: captor.fort_level ?? 0,
                race: captor.race,
              },
              'DUNGEON',
            )
          );
          // A stale candidate (ransomed/released/converted, or the captor
          // rebuilt the fort since the query) is a strict no-op.
          if (!overdue && !lostDungeon) return 0;
          // Escapees return home as citizens, never as trained soldiers.
          await tx.userUnit.upsert({
            where: {
              userId_type_level_isMercenary: {
                userId: row.sourceId,
                type: 'CITIZEN',
                level: 1,
                isMercenary: false,
              },
            },
            update: { quantity: { increment: row.quantity } },
            create: {
              userId: row.sourceId,
              type: 'CITIZEN',
              level: 1,
              quantity: row.quantity,
              isMercenary: false,
            },
          });
          await tx.captive.delete({ where: { id: row.id } });
          await tx.captiveEvent.create({
            data: {
              captorId: row.captorId,
              sourceId: row.sourceId,
              eraId: row.eraId,
              kind: 'ESCAPED',
              unitType: row.unitType,
              unitLevel: row.unitLevel,
              quantity: row.quantity,
              details: { reason: overdue ? 'overdue' : 'dungeon lost' },
            },
          });
          await tx.bank_history.create({
            data: {
              gold_amount: 0n,
              from_user_id: row.captorId,
              from_user_account_type: 'HAND',
              to_user_id: row.sourceId,
              to_user_account_type: 'HAND',
              date_time: now,
              history_type: 'DUNGEON',
              stats: {
                action: 'ESCAPE',
                quantity: row.quantity,
                message: `${row.quantity} captives escaped the dungeon and straggled home as citizens.`,
              },
            },
          });
          return row.quantity;
        }, CAPTIVE_TX_OPTIONS);
      } catch (error) {
        logError(`Captive escape pass failed for captive ${candidate.id}`, {
          error,
        });
      }
    }
    return { escaped };
  }

  /**
   * Era rollover: every captive is freed without returning to anyone — the
   * reset wipes all armies anyway. The event ledger stays as history.
   */
  static async clearCaptivesForEra(tx: Tx): Promise<number> {
    const cleared = await tx.captive.deleteMany({});
    return cleared.count;
  }
}
