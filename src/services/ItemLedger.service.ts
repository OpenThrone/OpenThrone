import prisma from '@/lib/prisma';
import type {
  ItemLedgerReason,
  ItemType,
  ItemUsage,
  Prisma,
} from '@/lib/prisma-exports';
import { withCronRunLog } from '@/services/CronRun.service';
import { ERA_TRANSACTION_OPTIONS } from '@/utils/eraLifecycleLock';
import { logError } from '@/utils/logger';
import { getOTDayKey } from '@/utils/timefunctions';

/** One item balance: the key the ledger, checkpoints and UserItem share. */
export interface ItemKey {
  userId: number;
  type: ItemType;
  usage: ItemUsage;
  level: number;
}

/** A signed change to one of a player's item balances. */
export type ItemDelta = Omit<ItemKey, 'userId'> & { delta: number };

/** A balance that does not equal its checkpoint plus its recorded changes. */
export interface ItemMismatch extends ItemKey {
  checkpointQuantity: number;
  ledgerDelta: number;
  actualQuantity: number;
  drift: number;
}

export interface ItemLedgerCheckResult {
  skipped: boolean;
  kind?: 'BASELINE' | 'CHECK';
  usersChecked: number;
  rowsChecked: number;
  entriesConsumed: number;
  mismatchCount: number;
}

type Balance = ItemKey & { quantity: number };
type Entry = ItemKey & { delta: number };

/** Keeps bulk writes under Postgres's limit on bound parameters. */
const WRITE_CHUNK = 5000;

const keyOf = (item: Omit<ItemKey, 'userId'> & { userId?: number }) =>
  `${item.userId ?? 0}:${item.type}:${item.usage}:${item.level}`;

const chunks = <T>(rows: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += WRITE_CHUNK)
    out.push(rows.slice(i, i + WRITE_CHUNK));
  return out;
};

/**
 * Records item changes in the caller's transaction, beside the balance write.
 * Pass what the operation meant to do, never a diff of the rows it saved:
 * that independence is what lets the daily check catch a bad write.
 */
export const recordItemLedger = async (
  tx: Prisma.TransactionClient,
  userId: number,
  reason: ItemLedgerReason,
  deltas: ItemDelta[],
) => {
  const merged = new Map<string, ItemDelta>();
  for (const change of deltas) {
    const key = keyOf(change);
    const current = merged.get(key);
    merged.set(key, {
      ...change,
      delta: (current?.delta ?? 0) + change.delta,
    });
  }
  const data = [...merged.values()]
    .filter((change) => change.delta !== 0)
    .map((change) => ({ ...change, userId, reason }));
  if (data.length > 0) await tx.itemLedgerEntry.createMany({ data });
};

/**
 * Compares each balance with checkpoint + recorded changes. An absent row and
 * a zero-quantity row are the same balance. `changedUsers` is everyone whose
 * checkpoint needs rewriting: they had entries or a mismatch.
 */
export const compareItemBalances = (
  balances: Balance[],
  checkpoints: Balance[],
  entries: Entry[],
) => {
  const keys = new Map<string, ItemKey>();
  const actual = new Map<string, number>();
  const checkpoint = new Map<string, number>();
  const delta = new Map<string, number>();
  const note = (row: ItemKey) =>
    keys.set(keyOf(row), {
      userId: row.userId,
      type: row.type,
      usage: row.usage,
      level: row.level,
    });
  for (const row of balances) {
    note(row);
    actual.set(keyOf(row), row.quantity);
  }
  for (const row of checkpoints) {
    note(row);
    checkpoint.set(keyOf(row), row.quantity);
  }
  for (const row of entries) {
    note(row);
    delta.set(keyOf(row), (delta.get(keyOf(row)) ?? 0) + row.delta);
  }

  const mismatches: ItemMismatch[] = [];
  const changedUsers = new Set(entries.map((entry) => entry.userId));
  for (const [key, item] of keys) {
    const checkpointQuantity = checkpoint.get(key) ?? 0;
    const ledgerDelta = delta.get(key) ?? 0;
    const actualQuantity = actual.get(key) ?? 0;
    const drift = actualQuantity - (checkpointQuantity + ledgerDelta);
    if (drift !== 0) {
      mismatches.push({
        ...item,
        checkpointQuantity,
        ledgerDelta,
        actualQuantity,
        drift,
      });
      changedUsers.add(item.userId);
    }
  }
  return {
    mismatches,
    changedUsers: [...changedUsers],
    usersChecked: new Set([...keys.values()].map((key) => key.userId)).size,
    rowsChecked: keys.size,
  };
};

const SKIPPED: ItemLedgerCheckResult = {
  skipped: true,
  usersChecked: 0,
  rowsChecked: 0,
  entriesConsumed: 0,
  mismatchCount: 0,
};

const isDuplicateRun = (error: unknown) =>
  (error as { code?: string } | null)?.code === 'P2002';

/**
 * Checks every player's item balances against the last checkpoint plus the
 * changes recorded since. Report only: it never touches UserItem.
 *
 * Everything reads from one RepeatableRead snapshot. Writers commit a balance
 * and its entries together, so the snapshot holds both or neither, and entries
 * are consumed by id, so one that commits mid-run waits for the next run. Any
 * failed or missed run needs no repair: its entries stay unconsumed.
 */
export const runItemLedgerCheck = async (
  now: Date = new Date(),
): Promise<ItemLedgerCheckResult> => {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const dayKey = getOTDayKey(now);
        const prior = await tx.itemLedgerRun.findFirst({
          orderBy: { id: 'desc' },
          select: { dayKey: true },
        });
        if (prior?.dayKey === dayKey) return SKIPPED;
        // Two runs started together both get here; the second fails on the
        // unique day and is reported as skipped below.
        const run = await tx.itemLedgerRun.create({
          data: { dayKey, kind: prior ? 'CHECK' : 'BASELINE' },
        });
        const balances = await tx.userItem.findMany({
          select: {
            userId: true,
            type: true,
            usage: true,
            level: true,
            quantity: true,
          },
        });
        const checkpoints = await tx.itemBalanceCheckpoint.findMany();
        const entries = await tx.itemLedgerEntry.findMany({
          where: { checkRunId: null },
          select: {
            id: true,
            userId: true,
            type: true,
            usage: true,
            level: true,
            delta: true,
          },
        });

        for (const ids of chunks(entries.map((entry) => entry.id)))
          await tx.itemLedgerEntry.updateMany({
            where: { id: { in: ids } },
            data: { checkRunId: run.id },
          });

        const nonZero = balances.filter((row) => row.quantity !== 0);
        if (!prior) {
          for (const data of chunks(nonZero))
            await tx.itemBalanceCheckpoint.createMany({ data });
          return {
            skipped: false,
            kind: 'BASELINE' as const,
            usersChecked: new Set(balances.map((row) => row.userId)).size,
            rowsChecked: balances.length,
            entriesConsumed: entries.length,
            mismatchCount: 0,
          };
        }

        const { mismatches, changedUsers, usersChecked, rowsChecked } =
          compareItemBalances(balances, checkpoints, entries);
        for (const data of chunks(mismatches))
          await tx.itemLedgerMismatch.createMany({
            data: data.map((row) => ({ ...row, runId: run.id })),
          });

        // A mismatch is reported once: the checkpoint moves to the real
        // balance, and the mismatch row stays as the durable record.
        for (const userIds of chunks(changedUsers)) {
          const changed = new Set(userIds);
          await tx.itemBalanceCheckpoint.deleteMany({
            where: { userId: { in: userIds } },
          });
          const data = nonZero.filter((row) => changed.has(row.userId));
          if (data.length > 0)
            await tx.itemBalanceCheckpoint.createMany({ data });
        }

        return {
          skipped: false,
          kind: 'CHECK' as const,
          usersChecked,
          rowsChecked,
          entriesConsumed: entries.length,
          mismatchCount: mismatches.length,
        };
      },
      // Inserts take key-share locks on users, which wait behind an era
      // rollover, so this shares the rollover's time budget.
      { ...ERA_TRANSACTION_OPTIONS, isolationLevel: 'RepeatableRead' },
    );
  } catch (error) {
    if (!isDuplicateRun(error)) throw error;
    return SKIPPED;
  }
};

/** The daily job's entry point: logged as its own run and never throws. */
export const runItemLedgerCheckSafely = async (now?: Date) => {
  try {
    await withCronRunLog('itemLedgerCheck', async () => {
      const result = await runItemLedgerCheck(now);
      if (result.mismatchCount > 0)
        logError('Item ledger check found unexplained balances', {
          mismatchCount: result.mismatchCount,
        });
      return { summary: { ...result } };
    });
  } catch (error) {
    logError('Item ledger check failed:', error);
  }
};
