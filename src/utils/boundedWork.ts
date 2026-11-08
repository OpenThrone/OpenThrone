import { AsyncLocalStorage } from 'node:async_hooks';

import prisma from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import { logError, logWarn } from '@/utils/logger';

/** A wall-clock allowance shared by the queries and writes of one job. */
export interface Budget {
  expired(): boolean;
  remainingMs(): number;
}

/** Thrown instead of starting a query once the job's budget has run out. */
export class BudgetExpiredError extends Error {
  constructor() {
    super('Time budget exhausted');
    this.name = 'BudgetExpiredError';
  }
}

export const createBudget = (ms: number): Budget => {
  const until = Date.now() + ms;
  return {
    expired: () => Date.now() >= until,
    remainingMs: () => Math.max(0, until - Date.now()),
  };
};

const ambientBudget = new AsyncLocalStorage<Budget>();

/**
 * Runs `fn` with `budget` in force for every withDbDeadline call it makes,
 * however deep (queries, signal writes, helpers): no query starts after the
 * budget is spent and each one is capped to the time left.
 */
export const runWithBudget = <T>(
  budget: Budget,
  fn: () => Promise<T>,
): Promise<T> => ambientBudget.run(budget, fn);

export interface DbDeadline {
  /** Per-statement ceiling; Postgres cancels a statement that runs longer. */
  statementMs: number;
  /** How long a statement may wait for a lock (including advisory locks). */
  lockMs?: number;
  /**
   * The job's remaining time (default: the ambient `runWithBudget` one). No
   * query starts once it is spent, and each
   * transaction's statement and lock deadlines are capped to what is left, so
   * the budget bounds the whole job rather than only the gaps between steps.
   */
  budget?: Budget;
}

type Tx = Prisma.TransactionClient;

/**
 * Wraps a transaction client so `beforeStatement` runs ahead of every
 * statement issued through it: the raw query methods and every method of every
 * model delegate. Used to re-arm the deadline from the time left at that
 * moment, so a statement can never inherit a timeout set earlier. Each
 * recheck -> arm -> statement runs to completion before the next one starts
 * (a per-transaction promise chain), so concurrent calls such as Promise.all
 * cannot interleave their SET LOCALs: a later statement is armed from the time
 * left after the earlier one finished, or refused. A transaction runs on one
 * connection, which executes statements one at a time anyway.
 */
function beforeEachStatement<T extends object>(
  target: T,
  beforeStatement: () => Promise<void>,
): T {
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <R>(job: () => Promise<R>): Promise<R> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };
  const wrap = <O extends object>(obj: O): O =>
    new Proxy(obj, {
      get(inner, prop) {
        const value = Reflect.get(inner, prop, inner);
        if (typeof prop === 'symbol' || prop === 'then') return value;
        if (typeof value === 'function')
          return (...args: unknown[]) =>
            exclusive(async () => {
              await beforeStatement();
              return value.apply(inner, args);
            });
        // Model delegates (tx.cheatSignal, tx.activityDay, ...).
        if (value && typeof value === 'object' && !prop.startsWith('$'))
          return wrap(value as object);
        return value;
      },
    });
  return wrap(target);
}

/**
 * Runs `fn` in a transaction whose statements all carry a Postgres statement
 * and lock deadline (`SET LOCAL`, so nothing leaks to the pooled connection).
 * A stalled query or contended advisory lock fails the transaction instead of
 * holding the caller's connection open.
 *
 * With a budget (explicit or ambient) the deadline is re-armed from the time
 * left immediately before every statement, not once at the start: waiting for
 * a pooled connection or an earlier slow statement cannot let a later one run
 * past the budget. Once it is spent, the next statement throws
 * BudgetExpiredError instead of running.
 */
export async function withDbDeadline<T>(
  fn: (tx: Tx) => Promise<T>,
  deadline: DbDeadline,
): Promise<T> {
  const statementCap = Math.max(100, Math.trunc(deadline.statementMs));
  const lockCap = Math.max(100, Math.trunc(deadline.lockMs ?? 2000));
  const budget = deadline.budget ?? ambientBudget.getStore();
  const capped = (cap: number) => {
    if (!budget) return cap;
    const remaining = Math.floor(budget.remainingMs());
    if (remaining <= 0) throw new BudgetExpiredError();
    // 0 would disable the Postgres timeout, so the floor is 1 ms.
    return Math.max(1, Math.min(cap, remaining));
  };
  // Checked before taking a connection, and again inside once it is held.
  capped(statementCap);
  return prisma.$transaction(
    async (tx) => {
      const arm = async () => {
        const statementMs = capped(statementCap);
        const lockMs = capped(lockCap);
        await tx.$executeRaw`SET LOCAL statement_timeout = ${Prisma.raw(String(statementMs))}`;
        await tx.$executeRaw`SET LOCAL lock_timeout = ${Prisma.raw(String(lockMs))}`;
      };
      await arm();
      return fn(budget ? beforeEachStatement(tx, arm) : tx);
    },
    { timeout: statementCap * 4 + 5000, maxWait: 5000 },
  );
}

export interface BestEffortRunner {
  /**
   * Runs `fn` unless `limit` jobs are already in flight. Never rejects: a
   * failure is logged and the job counted as dropped. Resolves true when `fn`
   * ran to completion, false when it was dropped or failed. Callers on a
   * request path must not await it.
   */
  run(fn: () => Promise<unknown>): Promise<boolean>;
  /** Resolves once every job started so far has settled (tests, shutdown). */
  idle(): Promise<void>;
  inflight(): number;
}

/** At most one overload warning per runner per this long. */
export const DROP_WARNING_INTERVAL_MS = 60_000;

/**
 * Fail-open, bounded-concurrency background work (no queue, drops on
 * overload). A slot is held until the job actually settles: a job's queries
 * all carry database deadlines (withDbDeadline), so a stalled job ends on its
 * own, and freeing the slot earlier would let the still-running callback keep
 * querying beside its replacement, exceeding `limit`. Drops are counted and
 * reported in a warning at most once per DROP_WARNING_INTERVAL_MS with the
 * number dropped since the last one, so overload is visible without flooding.
 */
export function createBestEffortRunner(
  name: string,
  limit: number,
): BestEffortRunner {
  const pending = new Set<Promise<boolean>>();
  let dropped = 0;
  let lastWarningAt = Number.NEGATIVE_INFINITY;
  return {
    run(fn) {
      if (pending.size >= limit) {
        dropped += 1;
        const now = Date.now();
        if (now - lastWarningAt >= DROP_WARNING_INTERVAL_MS) {
          logWarn(`${name} dropped work: ${limit} jobs already in flight`, {
            dropped,
            limit,
          });
          dropped = 0;
          lastWarningAt = now;
        }
        return Promise.resolve(false);
      }
      const job: Promise<boolean> = (async () => {
        try {
          await fn();
          return true;
        } catch (error) {
          logError(`${name} failed`, { error });
          return false;
        }
      })().finally(() => pending.delete(job));
      pending.add(job);
      return job;
    },
    async idle() {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    },
    inflight: () => pending.size,
  };
}
