import {
  ABUSE_BACKGROUND_LIMIT,
  ACTIVITY_SESSION_GAP_SECONDS,
} from '@/constants/abuseSignals';
import prisma from '@/lib/prisma';
import { getAbuseConfigBounded } from '@/services/AbuseConfig.service';
import { createBestEffortRunner, withDbDeadline } from '@/utils/boundedWork';
import { logError } from '@/utils/logger';

/** Counter writes in flight; more are dropped (a lost sample only thins the stats). */
const ACTIVITY_WRITE_LIMIT = ABUSE_BACKGROUND_LIMIT * 4;
const ACTIVITY_WRITE_STATEMENT_MS = 2000;
const ACTIVITY_WRITE_LOCK_MS = 1000;
const activityWrites = createBestEffortRunner(
  'Activity counter write',
  ACTIVITY_WRITE_LIMIT,
);
/** Resolves once every counter write started so far has settled (tests). */
export const settleActivityWrites = () => activityWrites.idle();

/**
 * Adds one gameplay action to the player's UTC-day timing counters, which
 * feed the admin-only bot-timing signal. One atomic upsert per action: the
 * hour set, action count and, when the previous action was in the same
 * session, the interval's sum and sum of squares (variance needs nothing
 * else). Stores no IP, device or content. Runs in the background under a
 * statement and lock deadline; callers never wait on it.
 */
async function recordActivityDay(userId: number): Promise<void> {
  // Collection stops entirely when abuse detection is off.
  if (!(await getAbuseConfigBounded())?.enabled) return;
  await withDbDeadline(
    (tx) =>
      tx.$executeRaw`
      INSERT INTO "ActivityDay"
        ("userId", "day", "hourMask", "actions", "gapCount", "gapSum", "gapSumSq", "lastAt")
      VALUES (
        ${userId},
        (now() AT TIME ZONE 'UTC')::date,
        (1 << EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC')::int),
        1, 0, 0, 0, now()
      )
      ON CONFLICT ("userId", "day") DO UPDATE SET
        "hourMask" = "ActivityDay"."hourMask"
          | (1 << EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC')::int),
        "actions" = "ActivityDay"."actions" + 1,
        "gapCount" = "ActivityDay"."gapCount" + CASE
          WHEN EXTRACT(EPOCH FROM now() - "ActivityDay"."lastAt") > 0
           AND EXTRACT(EPOCH FROM now() - "ActivityDay"."lastAt") <= ${ACTIVITY_SESSION_GAP_SECONDS}
          THEN 1 ELSE 0 END,
        "gapSum" = "ActivityDay"."gapSum" + CASE
          WHEN EXTRACT(EPOCH FROM now() - "ActivityDay"."lastAt") > 0
           AND EXTRACT(EPOCH FROM now() - "ActivityDay"."lastAt") <= ${ACTIVITY_SESSION_GAP_SECONDS}
          THEN EXTRACT(EPOCH FROM now() - "ActivityDay"."lastAt") ELSE 0 END,
        "gapSumSq" = "ActivityDay"."gapSumSq" + CASE
          WHEN EXTRACT(EPOCH FROM now() - "ActivityDay"."lastAt") > 0
           AND EXTRACT(EPOCH FROM now() - "ActivityDay"."lastAt") <= ${ACTIVITY_SESSION_GAP_SECONDS}
          THEN POWER(EXTRACT(EPOCH FROM now() - "ActivityDay"."lastAt"), 2) ELSE 0 END,
        "lastAt" = now()`,
    {
      statementMs: ACTIVITY_WRITE_STATEMENT_MS,
      lockMs: ACTIVITY_WRITE_LOCK_MS,
    },
  );
}

/**
 * Records that a player took a gameplay action (bank deposit, training,
 * armory purchase or sale, attack, spy mission, fort repair). The daily
 * citizen bonus only goes to accounts active within the configured window,
 * and the abuse bot-timing signal reads the per-day counters. Never throws:
 * a failed stamp must not fail the action it follows.
 */
export async function markGameplayActivity(userId: number): Promise<void> {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  try {
    await prisma.users.update({
      where: { id },
      data: { last_gameplay_at: new Date() },
    });
  } catch (error) {
    logError('Failed to record gameplay activity', { userId: id, error });
  }
  // Not awaited: contention or a stall here must never delay the action.
  activityWrites.run(() => recordActivityDay(id));
}
