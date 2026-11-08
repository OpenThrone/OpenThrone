import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import {
  DiscordApiError,
  discordBotConfigured,
  discordText,
  sendDirectMessage,
  siteUrl,
} from '@/services/discord/DiscordApi';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { isSupporter } from '@/services/supporter/Entitlement.service';
import type { DiscordNotifyPrefs } from '@/types/supporter';
import { DEFAULT_STAMINA_RULES, projectStamina } from '@/utils/stamina';

type Db = Prisma.TransactionClient | typeof prisma;

export const INSTANT_ALERTS = [
  'attacks',
  'spyHits',
  'wars',
  'turnCap',
] as const;
export type InstantAlert = (typeof INSTANT_ALERTS)[number];
export type AlertKind = InstantAlert | 'dailyDigest';

const MAX_ATTEMPTS = 5;
const HOUR = 3_600_000;

/**
 * Instant alerts are a supporter perk. Members of a sponsored (premium)
 * alliance also get war alerts, the alliance war-room perk.
 */
export async function allowedInstantAlerts(
  userId: number,
  db: Db = prisma,
): Promise<InstantAlert[]> {
  if (await isSupporter(userId, db)) return [...INSTANT_ALERTS];
  const premium = await db.alliance_memberships.findFirst({
    where: {
      user_id: userId,
      alliance: { sponsorship: { activeUntil: { gt: new Date() } } },
    },
    select: { id: true },
  });
  return premium ? ['wars'] : [];
}

const inQuietHours = (prefs: Partial<DiscordNotifyPrefs>, hour: number) => {
  const { quietHoursStart: start, quietHoursEnd: end } = prefs;
  if (start == null || end == null || start === end) return false;
  return start < end
    ? hour >= start && hour < end
    : hour >= start || hour < end;
};

/** Earliest send time outside the player's quiet hours (UTC). */
export function deliveryTime(prefs: Partial<DiscordNotifyPrefs>, now: Date) {
  if (!inQuietHours(prefs, now.getUTCHours())) return now;
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  do next.setTime(next.getTime() + HOUR);
  while (inQuietHours(prefs, next.getUTCHours()));
  return next;
}

/**
 * Queues one Discord DM if the player linked Discord, turned this alert on
 * and may receive it. Safe inside game transactions: it only reads and
 * inserts, and a repeated eventKey is ignored. Does nothing when no bot token
 * is configured.
 */
export async function enqueueDiscordAlert(
  db: Db,
  alert: {
    userId: number;
    kind: AlertKind;
    eventKey: string;
    text: string;
    /** `{ key }` values are translated into the player's language too. */
    vars: Record<string, string | number | { key: string }>;
    /** Send no earlier than this (still subject to quiet hours). */
    notBefore?: Date;
  },
) {
  if (!discordBotConfigured()) return false;
  const link = await db.discordLink.findUnique({
    where: { userId: alert.userId },
    select: {
      discordUserId: true,
      notifyPrefs: true,
      user: { select: { locale: true } },
    },
  });
  const prefs = (link?.notifyPrefs ?? {}) as Partial<DiscordNotifyPrefs>;
  if (!link || prefs[alert.kind] !== true) return false;
  if (
    alert.kind !== 'dailyDigest' &&
    !(await allowedInstantAlerts(alert.userId, db)).includes(alert.kind)
  )
    return false;
  const result = await db.discordOutbox.createMany({
    data: [
      {
        eventKey: alert.eventKey,
        userId: alert.userId,
        discordUserId: link.discordUserId,
        kind: alert.kind,
        content: discordText(
          link.user.locale,
          alert.text,
          Object.fromEntries(
            Object.entries(alert.vars).map(([name, value]) => [
              name,
              typeof value === 'object'
                ? discordText(link.user.locale, value.key)
                : value,
            ]),
          ),
        ),
        nextAttemptAt: deliveryTime(
          prefs,
          new Date(Math.max(Date.now(), alert.notBefore?.getTime() ?? 0)),
        ),
      },
    ],
    skipDuplicates: true,
  });
  return result.count > 0;
}

const finish = (
  id: number,
  status: 'SENT' | 'SKIPPED' | 'FAILED' | 'PENDING',
  extra: Prisma.DiscordOutboxUpdateInput = {},
) =>
  prisma.discordOutbox.update({
    where: { id },
    data: {
      status,
      lockedAt: null,
      ...(status === 'SENT' ? { sentAt: new Date(), lastError: null } : {}),
      ...extra,
    },
  });

/**
 * Sends one queued DM. Claims the row with SKIP LOCKED so several servers
 * never send the same message. Returns the claimed row's outcome, or null
 * when nothing is due.
 */
export async function processDiscordOutboxOne(
  send: typeof sendDirectMessage = sendDirectMessage,
) {
  const [row] = await prisma.$queryRaw<
    {
      id: number;
      userId: number;
      discordUserId: string;
      kind: string;
      content: string;
      attempts: number;
    }[]
  >`
    WITH picked AS (
      SELECT id FROM "DiscordOutbox"
      WHERE (status = 'PENDING' AND "nextAttemptAt" <= NOW())
         OR (status = 'SENDING' AND "lockedAt" < NOW() - INTERVAL '15 minutes')
      ORDER BY "nextAttemptAt", id LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE "DiscordOutbox" o SET status = 'SENDING', "lockedAt" = NOW(),
      attempts = o.attempts + 1
    FROM picked WHERE o.id = picked.id
    RETURNING o.id, o."userId", o."discordUserId", o.kind, o.content, o.attempts`;
  if (!row) return null;
  // The player may have unlinked, relinked, turned this alert off or set
  // quiet hours since this was queued.
  const link = await prisma.discordLink.findUnique({
    where: { userId: row.userId },
    select: { discordUserId: true, notifyPrefs: true },
  });
  const prefs = (link?.notifyPrefs ?? {}) as Partial<DiscordNotifyPrefs>;
  if (
    link?.discordUserId !== row.discordUserId ||
    prefs[row.kind as AlertKind] !== true
  ) {
    await finish(row.id, 'SKIPPED', { lastError: 'unlinked or turned off' });
    return 'SKIPPED';
  }
  // A stamina alert queued ahead of time is stale if the player has spent
  // stamina since; it is re-queued for the new refill time.
  if (row.kind === 'turnCap' && !(await staminaIsFull(row.userId))) {
    await finish(row.id, 'SKIPPED', { lastError: 'stamina not full' });
    return 'SKIPPED';
  }
  const at = deliveryTime(prefs, new Date());
  if (at.getTime() > Date.now()) {
    await finish(row.id, 'PENDING', {
      attempts: row.attempts - 1,
      nextAttemptAt: at,
    });
    return 'PENDING';
  }
  try {
    await send(row.discordUserId, row.content);
    await finish(row.id, 'SENT');
    return 'SENT';
  } catch (error) {
    const api = error instanceof DiscordApiError ? error : null;
    // 50007: the player blocks DMs from server members or the bot.
    if (api?.code === 50007 || api?.status === 403) {
      await finish(row.id, 'SKIPPED', { lastError: api.message });
      return 'SKIPPED';
    }
    const rateLimited = api?.status === 429;
    const failed = !rateLimited && row.attempts >= MAX_ATTEMPTS;
    await finish(row.id, failed ? 'FAILED' : 'PENDING', {
      lastError: api?.message ?? 'send failed',
      // A rate limit is not the message's fault, so it keeps its attempts.
      ...(rateLimited ? { attempts: row.attempts - 1 } : {}),
      nextAttemptAt: new Date(
        Date.now() +
          (rateLimited
            ? (api?.retryAfterMs ?? 5000)
            : 60_000 * 2 ** (row.attempts - 1)),
      ),
    });
    return failed ? 'FAILED' : 'PENDING';
  }
}

/** Finished rows are kept two weeks for support questions. */
export const pruneDiscordOutbox = () =>
  prisma.discordOutbox.deleteMany({
    where: {
      status: { in: ['SENT', 'SKIPPED', 'FAILED'] },
      createdAt: { lt: new Date(Date.now() - 14 * 24 * HOUR) },
    },
  });

/**
 * Queues the once-a-day digest (free for every linked player who turned it
 * on). The date in the event key keeps a rerun of the daily job from
 * sending twice.
 */
export async function enqueueDailyDigests(now = new Date()) {
  if (!discordBotConfigured()) return 0;
  const since = new Date(now.getTime() - 24 * HOUR);
  const day = now.toISOString().slice(0, 10);
  const links = await prisma.discordLink.findMany({
    select: { userId: true, notifyPrefs: true },
  });
  let queued = 0;
  for (const link of links) {
    if ((link.notifyPrefs as Partial<DiscordNotifyPrefs>)?.dailyDigest !== true)
      continue;
    const { userId } = link;
    const [user, attacks, spies, membership] = await Promise.all([
      prisma.users.findUnique({
        where: { id: userId },
        select: { display_name: true, rank: true },
      }),
      prisma.attack_log.count({
        where: {
          defender_id: userId,
          type: 'attack',
          timestamp: { gte: since },
        },
      }),
      prisma.attack_log.count({
        where: {
          defender_id: userId,
          // Only caught missions; the defender never sees successful ones.
          winner: userId,
          type: { in: ['INTEL', 'ASSASSINATE', 'INFILTRATE'] },
          timestamp: { gte: since },
        },
      }),
      prisma.alliance_memberships.findFirst({
        where: { user_id: userId },
        select: { alliance_id: true },
      }),
    ]);
    if (!user) continue;
    const wars = await prisma.alliance_wars.count({
      where: {
        status: { in: ['WARMUP', 'ACTIVE'] },
        OR: [
          { defender_user_id: userId },
          ...(membership
            ? [
                { attacker_alliance_id: membership.alliance_id },
                { defender_alliance_id: membership.alliance_id },
              ]
            : []),
        ],
      },
    });
    if (
      await enqueueDiscordAlert(prisma, {
        userId,
        kind: 'dailyDigest',
        eventKey: `digest:${userId}:${day}`,
        text: 'alert.digest',
        vars: {
          kingdom: user.display_name,
          rank: user.rank || '—',
          attacks,
          spies,
          wars,
          url: siteUrl('/home/overview'),
        },
      })
    )
      queued++;
  }
  return queued;
}

const staminaRules = async () =>
  (await getRuntimeConfig()).stamina ?? DEFAULT_STAMINA_RULES;

async function staminaIsFull(userId: number) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { stamina: true, maxStamina: true, staminaUpdatedAt: true },
  });
  if (!user) return false;
  const now = projectStamina(user, await staminaRules());
  return now.stamina >= now.maxStamina;
}

/**
 * Stamina refills on a wall clock (src/utils/stamina.ts), so there is no
 * write when it becomes full. Each turn run queues, for every linked player
 * with the alert on, a DM timed for when their stamina will be full. The key
 * is tied to the balance's last update, so spending stamina queues a new one
 * and the sender drops any that are no longer true.
 */
export async function enqueueStaminaFullAlerts(now = new Date()) {
  if (!discordBotConfigured()) return 0;
  const rules = await staminaRules();
  if (!rules.enabled || !rules.recoveryEnabled || rules.recoveryAmount <= 0)
    return 0;
  const links = await prisma.discordLink.findMany({
    select: { userId: true, notifyPrefs: true },
  });
  let queued = 0;
  for (const link of links) {
    if ((link.notifyPrefs as Partial<DiscordNotifyPrefs>)?.turnCap !== true)
      continue;
    const user = await prisma.users.findUnique({
      where: { id: link.userId },
      select: {
        display_name: true,
        stamina: true,
        maxStamina: true,
        staminaUpdatedAt: true,
      },
    });
    if (!user || user.stamina >= user.maxStamina) continue;
    const intervals = Math.ceil(
      (user.maxStamina - user.stamina) / rules.recoveryAmount,
    );
    const fullAt = new Date(
      user.staminaUpdatedAt.getTime() +
        intervals * rules.recoveryIntervalMinutes * 60_000,
    );
    if (
      await enqueueDiscordAlert(prisma, {
        userId: link.userId,
        kind: 'turnCap',
        eventKey: `stamina:${link.userId}:${user.staminaUpdatedAt.getTime()}`,
        text: 'alert.turnCap',
        vars: { kingdom: user.display_name, url: siteUrl('/battle/users') },
        notBefore: fullAt > now ? fullAt : undefined,
      })
    )
      queued++;
  }
  return queued;
}
