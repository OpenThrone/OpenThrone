import prisma from '@/lib/prisma';
import { redactAttackLogForViewer } from '@/services/AttackLogAccess.service';

/** One download per player per rolling window. */
export const EXPORT_WINDOW_HOURS = 24;
const EXPORT_WINDOW_MS = EXPORT_WINDOW_HOURS * 3_600_000;
const PAGE_SIZE = 250;
/** Newest audit entries listed in the export; older ones are not included. */
const ACTIVITY_LOG_LIMIT = 5000;

export type ExportErrorCode = 'rate_limited' | 'not_found';

/** Expected refusal; `retryAt` is set for `rate_limited`. */
export class ExportError extends Error {
  constructor(
    public readonly code: ExportErrorCode,
    public readonly retryAt?: Date,
  ) {
    super(code);
    this.name = 'ExportError';
  }
}

/**
 * What the export contains and leaves out. Written into the file itself so the
 * player sees the same list the settings page promises.
 */
export const EXPORT_INCLUDED = [
  'account',
  'kingdom',
  'units',
  'items',
  'structureUpgrades',
  'battleUpgrades',
  'bonusPoints',
  'eras',
  'accountStatusHistory',
  'resetHistory',
  'battleAndSpyLogs',
  'captives',
  'desertions',
  'forceContracts',
  'messagesAuthored',
  'chatMessagesAuthored',
  'friends',
  'allianceMemberships',
  'allianceJoinRequests',
  'allianceAnnouncements',
  'allianceListEntries',
  'allianceTargetCalls',
  'allianceIntelShares',
  'allianceBankActivity',
  'allianceGoldRequests',
  'allianceLoans',
  'recruitHistory',
  'reportsFiled',
  'banAppeals',
  'emailPreferences',
  'discordLink',
  'supporter',
  'payments',
  'purchaseConsents',
  'giftsPurchased',
  'signInHistory',
  'activityLog',
] as const;

export const EXPORT_EXCLUDED = [
  'passwordHash',
  'twoFactorSecret',
  'sessionsAndApiTokens',
  'moderationFile',
  'fairPlaySignals',
  'activityTimingCounters',
  'staffNotesAndAssignments',
  'reportsAgainstYou',
  'messagesFromOthers',
  'otherPlayersChatMessages',
  'otherPlayersPrivateData',
  'cardData',
  'emailDeliveryQueue',
  'rateLimitCounters',
] as const;

type Row = Record<string, unknown>;
/** The prisma client is untyped here, so paged rows are declared by shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRow = {
  id: number;
  attacker_id: number;
  defender_id: number;
  winner: number;
} & Record<string, any>;
type SectionValue = unknown | AsyncGenerator<unknown>;

const isAsyncIterable = (value: unknown): value is AsyncGenerator<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  Symbol.asyncIterator in (value as object);

const replacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;

/** Pages through a cursor query so large histories never sit in memory at once. */
async function* paged<T>(
  fetchPage: (afterId: number) => PromiseLike<T[]>,
  idOf: (row: T) => number,
): AsyncGenerator<T> {
  let afterId = 0;
  for (;;) {
    const rows = await fetchPage(afterId);
    for (const row of rows) yield row;
    if (rows.length < PAGE_SIZE) return;
    afterId = idOf(rows[rows.length - 1]);
  }
}

/**
 * Streams a history table by id cursor, one page at a time. `shape` turns a
 * whole page into output rows, so name lookups happen per page and never for
 * the full history at once. `model` is a prisma delegate name.
 */
function history(
  model: string,
  where: Record<string, unknown>,
  options: {
    select?: Record<string, unknown>;
    include?: Record<string, unknown>;
    shape?: (rows: DbRow[]) => PromiseLike<unknown[]> | unknown[];
  } = {},
) {
  const { shape, ...query } = options;
  return (async function* streamHistory() {
    let afterId = 0;
    for (;;) {
      const rows: DbRow[] = await prisma[model].findMany({
        where: { ...where, id: { gt: afterId } },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        ...query,
      });
      for (const item of shape ? await shape(rows) : rows) yield item;
      if (rows.length < PAGE_SIZE) return;
      afterId = rows[rows.length - 1].id;
    }
  })();
}

/** Records a download attempt, refusing a second one inside the window. */
export async function beginExport(userId: number, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const since = new Date(now.getTime() - EXPORT_WINDOW_MS);
    const last = await tx.accountDataExport.findFirst({
      where: { userId, requestedAt: { gt: since } },
      orderBy: { requestedAt: 'desc' },
      select: { requestedAt: true },
    });
    if (last) {
      throw new ExportError(
        'rate_limited',
        new Date(last.requestedAt.getTime() + EXPORT_WINDOW_MS),
      );
    }
    return tx.accountDataExport.create({
      data: { userId, requestedAt: now },
      select: { id: true },
    });
  });
}

/** Gives the attempt back when generation failed, so the player can retry. */
export async function abandonExport(exportId: number) {
  await prisma.accountDataExport
    .deleteMany({ where: { id: exportId, completedAt: null } })
    .catch(() => undefined);
}

async function namesFor(ids: Array<number | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is number => id != null))];
  if (!unique.length) return new Map<number, string>();
  const users = await prisma.users.findMany({
    where: { id: { in: unique } },
    select: { id: true, display_name: true },
  });
  return new Map(users.map((user) => [user.id, user.display_name]));
}

/** Status rows; staff-written reasons are left out because they can carry internal notes. */
const statusReasonVisible = (row: DbRow) =>
  row.admin_id === null &&
  row.status !== 'BANNED' &&
  row.status !== 'SUSPENDED';

function buildSections(userId: number): Array<[string, () => SectionValue]> {
  const own = { userId };
  return [
    [
      'account',
      async () => {
        const user = await prisma.users.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            display_name: true,
            race: true,
            class: true,
            locale: true,
            colorScheme: true,
            bio: true,
            avatar: true,
            recruit_link: true,
            created_at: true,
            updated_at: true,
            last_active: true,
            last_gameplay_at: true,
            twoFactorSecret: true,
          },
        });
        if (!user) return null;
        const { twoFactorSecret, ...rest } = user;
        return { ...rest, twoFactorEnabled: Boolean(twoFactorSecret) };
      },
    ],
    [
      'kingdom',
      () =>
        prisma.users.findUnique({
          where: { id: userId },
          select: {
            experience: true,
            rank: true,
            gold: true,
            gold_in_bank: true,
            fort_level: true,
            fort_hitpoints: true,
            house_level: true,
            economy_level: true,
            attack_turns: true,
            stamina: true,
            maxStamina: true,
            kingdom_morale: true,
            racial_perk_tier: true,
            wounded_units: true,
            offense: true,
            defense: true,
            spy: true,
            sentry: true,
            killing_str: true,
            defense_str: true,
            spying_str: true,
            sentry_str: true,
            stats: true,
            achievements: true,
            tutorial_state: true,
            currentEraId: true,
            era_joined_at: true,
            supporter_until: true,
          },
        }),
    ],
    ['units', () => prisma.userUnit.findMany({ where: own })],
    ['items', () => prisma.userItem.findMany({ where: own })],
    [
      'structureUpgrades',
      () => prisma.userStructureUpgrade.findMany({ where: own }),
    ],
    ['battleUpgrades', () => prisma.userBattleUpgrade.findMany({ where: own })],
    ['bonusPoints', () => prisma.userBonusPoints.findMany({ where: own })],
    ['eras', () => prisma.userEra.findMany({ where: own })],
    [
      'accountStatusHistory',
      () =>
        history(
          'accountStatusHistory',
          { user_id: userId },
          {
            shape: (rows) =>
              rows.map((row) => ({
                id: row.id,
                status: row.status,
                start_date: row.start_date,
                end_date: row.end_date,
                reason: statusReasonVisible(row) ? row.reason : null,
              })),
          },
        ),
    ],
    [
      'resetHistory',
      () =>
        history(
          'accountResetHistory',
          { userId },
          {
            shape: (rows) =>
              rows.map((row) => ({
                id: row.id,
                resetDate: row.resetDate,
                reason: row.reason,
              })),
          },
        ),
    ],
    [
      'battleAndSpyLogs',
      () =>
        (async function* streamBattleLogs() {
          // Same viewer-side redaction as the in-game battle and spy reports.
          const fetchPage = async (afterId: number) =>
            prisma.attack_log.findMany({
              where: {
                id: { gt: afterId },
                OR: [{ attacker_id: userId }, { defender_id: userId }],
              },
              orderBy: { id: 'asc' },
              take: PAGE_SIZE,
              include: {
                attackerPlayer: {
                  select: { id: true, display_name: true, avatar: true },
                },
                defenderPlayer: {
                  select: { id: true, display_name: true, avatar: true },
                },
              },
            });
          for await (const log of paged<DbRow>(fetchPage, (row) => row.id)) {
            yield {
              ...redactAttackLogForViewer(
                log,
                log.attacker_id === userId ? 'attacker' : 'defender',
              ),
              yourRole: log.attacker_id === userId ? 'attacker' : 'defender',
              pillaged_gold: log.pillaged_gold,
            };
          }
        })(),
    ],
    [
      'captives',
      () =>
        history(
          'captive',
          { OR: [{ captorId: userId }, { sourceId: userId }] },
          {
            shape: async (rows) => {
              const names = await namesFor(
                rows.flatMap((r) => [r.captorId, r.sourceId]),
              );
              return rows.map((row) => ({
                ...row,
                captorName: names.get(row.captorId) ?? null,
                sourceName: names.get(row.sourceId) ?? null,
              }));
            },
          },
        ),
    ],
    [
      'desertions',
      () =>
        history(
          'desertionEvent',
          { userId },
          {
            shape: async (rows) => {
              const names = await namesFor(rows.map((r) => r.defectedToUserId));
              return rows.map((row) => ({
                ...row,
                defectedToName: row.defectedToUserId
                  ? (names.get(row.defectedToUserId) ?? null)
                  : null,
              }));
            },
          },
        ),
    ],
    ['forceContracts', () => history('forceContract', own)],
    [
      'messagesAuthored',
      () =>
        (async function* streamMessages() {
          const fetchPage = async (afterId: number) =>
            prisma.messages.findMany({
              where: { from_user_id: userId, id: { gt: afterId } },
              orderBy: { id: 'asc' },
              take: PAGE_SIZE,
              select: {
                id: true,
                subject: true,
                body: true,
                to_user_id: true,
                date_time: true,
                users_messages_to_user_idTousers: {
                  select: { display_name: true },
                },
              },
            });
          for await (const message of paged<DbRow>(
            fetchPage,
            (row) => row.id,
          )) {
            const { users_messages_to_user_idTousers: to, ...rest } = message;
            yield { ...rest, toDisplayName: to?.display_name ?? null };
          }
        })(),
    ],
    [
      'chatMessagesAuthored',
      () =>
        (async function* streamChatMessages() {
          const fetchPage = async (afterId: number) =>
            prisma.chatMessage.findMany({
              where: {
                senderId: userId,
                deletedAt: null,
                id: { gt: afterId },
              },
              orderBy: { id: 'asc' },
              take: PAGE_SIZE,
              select: {
                id: true,
                roomId: true,
                content: true,
                messageType: true,
                sentAt: true,
              },
            });
          for await (const message of paged<DbRow>(
            fetchPage,
            (row) => row.id,
          )) {
            yield message;
          }
        })(),
    ],
    [
      'friends',
      () =>
        history(
          'social',
          { OR: [{ playerId: userId }, { friendId: userId }] },
          {
            shape: async (rows) => {
              const names = await namesFor(
                rows.flatMap((r) => [r.playerId, r.friendId]),
              );
              return rows.map((row) => {
                const otherId =
                  row.playerId === userId ? row.friendId : row.playerId;
                return {
                  id: row.id,
                  otherPlayerId: otherId,
                  otherPlayerName: names.get(otherId) ?? null,
                  youSentTheRequest: row.playerId === userId,
                  relationshipType: row.relationshipType,
                  status: row.status,
                  requestDate: row.requestDate,
                  acceptanceDate: row.acceptanceDate,
                  endDate: row.endDate,
                };
              });
            },
          },
        ),
    ],
    [
      'allianceMemberships',
      async () => {
        const rows = await prisma.alliance_memberships.findMany({
          where: { user_id: userId },
          include: {
            alliance: { select: { name: true } },
            role: { select: { name: true } },
          },
        });
        return rows.map((row) => ({
          id: row.id,
          allianceId: row.alliance_id,
          allianceName: row.alliance?.name ?? null,
          roleName: row.role?.name ?? null,
          joinedAt: row.created_at,
        }));
      },
    ],
    [
      'allianceJoinRequests',
      () => history('alliance_join_requests', { user_id: userId }),
    ],
    [
      'allianceAnnouncements',
      () => history('alliance_announcements', { author_id: userId }),
    ],
    [
      'allianceListEntries',
      () =>
        history(
          'alliance_list_entries',
          { added_by: userId },
          {
            shape: async (rows) => {
              const names = await namesFor(rows.map((r) => r.target_user_id));
              return rows.map((row) => ({
                ...row,
                targetName: names.get(row.target_user_id) ?? null,
              }));
            },
          },
        ),
    ],
    [
      'allianceTargetCalls',
      () =>
        history(
          'alliance_target_calls',
          { created_by: userId },
          {
            shape: async (rows) => {
              const names = await namesFor(rows.map((r) => r.target_user_id));
              return rows.map((row) => ({
                ...row,
                targetName: names.get(row.target_user_id) ?? null,
              }));
            },
          },
        ),
    ],
    [
      'allianceIntelShares',
      () => history('alliance_intel_shares', { shared_by: userId }),
    ],
    [
      'allianceBankActivity',
      () => history('alliance_bank_history', { performed_by_user_id: userId }),
    ],
    [
      'allianceGoldRequests',
      () => history('alliance_gold_requests', { requester_id: userId }),
    ],
    ['allianceLoans', () => history('alliance_loans', { borrower_id: userId })],
    [
      'recruitHistory',
      () =>
        history(
          'recruit_history',
          { OR: [{ from_user: userId }, { to_user: userId }] },
          {
            shape: async (rows) => {
              const names = await namesFor(
                rows.flatMap((r) => [r.from_user, r.to_user]),
              );
              return rows.map((row) => ({
                id: row.id,
                source: row.source,
                timestamp: row.timestamp,
                role: row.to_user === userId ? 'recruited' : 'recruiter',
                fromUserId: row.from_user,
                fromUserName: row.from_user
                  ? (names.get(row.from_user) ?? null)
                  : null,
                toUserId: row.to_user,
                toUserName: names.get(row.to_user) ?? null,
                // Only the address recorded for you; a recruit's address is theirs.
                ipAddress: row.to_user === userId ? row.ip_addr : null,
              }));
            },
          },
        ),
    ],
    [
      'reportsFiled',
      () =>
        history(
          'report',
          { reporterUserId: userId },
          {
            select: {
              id: true,
              reportedUserId: true,
              category: true,
              status: true,
              subject: true,
              description: true,
              createdAt: true,
            },
          },
        ),
    ],
    [
      'banAppeals',
      () =>
        history(
          'banAppeal',
          { userId },
          {
            select: {
              id: true,
              status: true,
              subject: true,
              body: true,
              decisionSummary: true,
              decidedAt: true,
              createdAt: true,
            },
          },
        ),
    ],
    [
      'emailPreferences',
      () =>
        prisma.emailPreference.findUnique({
          where: own,
          select: {
            newsEmails: true,
            announcementEmails: true,
            attackNotificationEmails: true,
            unsubscribedAllAt: true,
            updatedAt: true,
          },
        }),
    ],
    [
      'discordLink',
      () =>
        prisma.discordLink.findUnique({
          where: own,
          select: {
            discordUserId: true,
            discordUsername: true,
            linkedAt: true,
            notifyPrefs: true,
          },
        }),
    ],
    [
      'supporter',
      () =>
        prisma.supporterMembership.findUnique({
          where: own,
          select: {
            tier: true,
            status: true,
            source: true,
            provider: true,
            currentPeriodEnd: true,
            subscriptionPeriodEnd: true,
            cancelAtPeriodEnd: true,
            startedAt: true,
            badgeVisible: true,
          },
        }),
    ],
    [
      'payments',
      () =>
        history(
          'payment',
          { userId },
          {
            select: {
              id: true,
              kind: true,
              status: true,
              amountCents: true,
              currency: true,
              taxCents: true,
              refundedCents: true,
              provider: true,
              providerPaymentId: true,
              description: true,
              createdAt: true,
              accessFrom: true,
              accessUntil: true,
              billingCountry: true,
              billingState: true,
              refunds: {
                select: { amountCents: true, reason: true, createdAt: true },
              },
            },
          },
        ),
    ],
    [
      'purchaseConsents',
      () =>
        history(
          'purchaseConsent',
          { userId },
          {
            select: {
              id: true,
              planId: true,
              amountCents: true,
              currency: true,
              locale: true,
              version: true,
              text: true,
              acceptedAt: true,
            },
          },
        ),
    ],
    [
      'giftsPurchased',
      () =>
        history(
          'giftCode',
          { purchaserUserId: userId },
          {
            select: {
              id: true,
              months: true,
              codePrefix: true,
              createdAt: true,
              expiresAt: true,
              redeemedAt: true,
              revokedAt: true,
            },
          },
        ),
    ],
    [
      'signInHistory',
      () =>
        history(
          'loginEvent',
          { userId },
          {
            shape: (rows) =>
              rows.map(({ id: _id, userId: _userId, ...event }) => event),
          },
        ),
    ],
    [
      'activityLog',
      async () => {
        const rows = await prisma.auditLog.findMany({
          where: own,
          orderBy: { id: 'desc' },
          take: ACTIVITY_LOG_LIMIT,
          select: {
            timestamp: true,
            action: true,
            ip: true,
            entityType: true,
            entityId: true,
          },
        });
        return rows.reverse();
      },
    ],
  ];
}

export interface ExportResult {
  bytes: number;
  sections: number;
}

/**
 * Streams the export as one JSON document through `write`: a header listing
 * what is and is not included, then each section in turn. Large histories are
 * read in pages. Throws if the account does not exist.
 */
export async function streamAccountExport(
  userId: number,
  write: (chunk: string) => Promise<void> | void,
  now = new Date(),
): Promise<ExportResult> {
  const exists = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!exists) throw new ExportError('not_found');

  let bytes = 0;
  const emit = async (chunk: string) => {
    bytes += Buffer.byteLength(chunk);
    await write(chunk);
  };
  const sections = buildSections(userId);

  await emit(
    `{"meta":${JSON.stringify(
      {
        service: 'OpenThrone',
        formatVersion: 1,
        exportedAt: now.toISOString(),
        accountId: userId,
        included: EXPORT_INCLUDED,
        excluded: EXPORT_EXCLUDED,
      },
      replacer,
    )}`,
  );
  for (const [name, produce] of sections) {
    const value = await produce();
    await emit(`,${JSON.stringify(name)}:`);
    if (isAsyncIterable(value)) {
      await emit('[');
      let first = true;
      for await (const item of value) {
        await emit(
          `${first ? '' : ','}${JSON.stringify(item as Row, replacer)}`,
        );
        first = false;
      }
      await emit(']');
    } else {
      await emit(JSON.stringify(value ?? null, replacer));
    }
  }
  await emit('}\n');
  return { bytes, sections: sections.length };
}

/** Marks the attempt finished and records its size. */
export async function completeExport(exportId: number, result: ExportResult) {
  await prisma.accountDataExport.update({
    where: { id: exportId },
    data: {
      completedAt: new Date(),
      byteSize: result.bytes,
      sections: result.sections,
    },
  });
}
