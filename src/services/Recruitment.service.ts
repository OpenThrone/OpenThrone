import { multiplyCount } from '@/constants/gameEvents';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { getUserById } from '@/services/AttackDataService';
import { getGameEventModifiers } from '@/services/GameEventRuntime.service';
import { lockRecruitmentRecipient } from '@/services/recruitmentGuards';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import type { RecruitmentStatus } from '@/utils/recruitmentStatus';
import { getOTStartDate } from '@/utils/timefunctions';

type RecruitmentLimitStrategy = 'standard' | 'linkBased';
type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

/** Default internal claims per day; configured by recruit.internalDailyCap. */
export const RECRUITER_DAILY_CAP = 250;

export interface RecruitmentContext {
  internalDailyCap: number;
  externalDailyCap: number;
  externalIpDailyCap: number;
  recruitCitizenMultiplier: number;
}
const validCap = (value: unknown, fallback: number) => {
  const cap = Number(value);
  return Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : fallback;
};
/** Resolve outside API transactions; direct service callers use their own tx connection. */
export async function resolveRecruitmentContext(
  tx?: Prisma.TransactionClient,
): Promise<RecruitmentContext> {
  const [config, modifiers] = await Promise.all([
    getRuntimeConfig(tx),
    getGameEventModifiers(tx),
  ]);
  return {
    internalDailyCap: validCap(config.recruitDailyCap, 250),
    externalDailyCap: validCap(config.externalRecruitDailyCap, 25),
    externalIpDailyCap: validCap(config.externalRecruitIpDailyCap, 5),
    recruitCitizenMultiplier: modifiers.recruitCitizenMultiplier,
  };
}

/** Citizens a player can gain per day by recruiting (admin setting). */
export async function getRecruiterDailyCap(): Promise<number> {
  const config = await getRuntimeConfig();
  const cap = Number(config.recruitDailyCap);
  return Number.isFinite(cap) && cap >= 0
    ? Math.floor(cap)
    : RECRUITER_DAILY_CAP;
}
/** Default for citizens a player can receive per day through their recruit link. */
export const TARGET_DAILY_CAP = 25;
/** External owner allowance; independent of the internal recruiting quota. */
export async function getTargetDailyCap(): Promise<number> {
  const config = await getRuntimeConfig();
  const cap = Number(config.externalRecruitDailyCap);
  return Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : TARGET_DAILY_CAP;
}
export async function getExternalRecruitIpDailyCap(): Promise<number> {
  const config = await getRuntimeConfig();
  const cap = Number(config.externalRecruitIpDailyCap);
  return Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : 5;
}

export const RECRUITER_DAILY_CAP_ERROR =
  'You have reached the daily recruitment limit.';
export const TARGET_DAILY_CAP_ERROR =
  'This player has reached the daily recruitment limit.';

const resolveDb = (db?: PrismaClientOrTx) => db ?? prisma;

/**
 * Recruitment limits are daily, but a reset within the OT day starts a fresh
 * quota window. Resolve the current era read-only so cap checks never create it.
 */
const getRecruitmentWindowStart = async (
  db: PrismaClientOrTx,
  requestedSince = getOTStartDate(),
) => {
  const todayStart = getOTStartDate();
  const activeEra = await db.era.findFirst({
    where: { endDate: null },
    orderBy: { startDate: 'desc' },
    select: { startDate: true },
  });
  let windowStart = requestedSince > todayStart ? requestedSince : todayStart;
  if (activeEra && activeEra.startDate > windowStart) {
    windowStart = activeEra.startDate;
  }
  return windowStart;
};

/** Per recruiter and link owner pair, per day (see ensureRecruitmentLimit). */
export const RECRUIT_PAIR_DAILY_LIMIT = 5;
export const RECRUIT_PAIR_LIMIT_ERROR =
  'User has already been recruited 5 times in the last 24 hours.';

/** Machine-readable reasons a signed-in recruiter cannot recruit a target today. */
export type RecruitmentBlockCode =
  | 'RECRUITER_DAILY_CAP_REACHED'
  | 'TARGET_DAILY_CAP_REACHED'
  | 'PAIR_LIMIT_REACHED';

export const RECRUITMENT_BLOCK_ERRORS: Record<RecruitmentBlockCode, string> = {
  RECRUITER_DAILY_CAP_REACHED: RECRUITER_DAILY_CAP_ERROR,
  TARGET_DAILY_CAP_REACHED: TARGET_DAILY_CAP_ERROR,
  PAIR_LIMIT_REACHED: RECRUIT_PAIR_LIMIT_ERROR,
};

/** Maps an error thrown by performRecruitment to its block code, if any. */
export const recruitmentBlockCodeForError = (
  message: string,
): RecruitmentBlockCode | null => {
  const match = (
    Object.entries(RECRUITMENT_BLOCK_ERRORS) as [RecruitmentBlockCode, string][]
  ).find(([, error]) => error === message);
  return match ? match[0] : null;
};

/**
 * Read-only pre-check mirroring the limits performRecruitment enforces for a
 * signed-in recruiter (standard strategy). The recruiter cap is reported first
 * because it blocks every target. The transaction still re-checks under locks.
 */
export const getRecruitmentBlock = async ({
  db,
  recruiterId,
  targetId,
  since = getOTStartDate(),
}: {
  db?: PrismaClientOrTx;
  recruiterId: number;
  targetId: number;
  since?: Date;
}): Promise<RecruitmentBlockCode | null> => {
  const client = resolveDb(db);
  const windowStart = await getRecruitmentWindowStart(client, since);
  const timestamp = { gte: windowStart };
  const [recruiterTotal, pairTotal] = await Promise.all([
    client.recruit_history.count({
      where: {
        source: 'INTERNAL',
        to_user: recruiterId,
        from_user: { not: 0 },
        timestamp,
      },
    }),
    client.recruit_history.count({
      where: {
        source: 'INTERNAL',
        from_user: targetId,
        to_user: recruiterId,
        timestamp,
      },
    }),
  ]);
  if (recruiterTotal >= (await getRecruiterDailyCap())) {
    return 'RECRUITER_DAILY_CAP_REACHED';
  }
  if (pairTotal >= RECRUIT_PAIR_DAILY_LIMIT) return 'PAIR_LIMIT_REACHED';
  return null;
};

/**
 * Read-only daily allowance for the signed-in recruiter, so the UI can show how
 * many recruits are left and disable buttons that would be refused. Uses the
 * same window and counts as getRecruitmentBlock.
 */
export const getRecruitmentStatus = async ({
  db,
  recruiterId,
  targetIds,
}: {
  db?: PrismaClientOrTx;
  recruiterId: number;
  targetIds: number[];
}): Promise<RecruitmentStatus> => {
  const client = resolveDb(db);
  const windowStart = await getRecruitmentWindowStart(client);
  const timestamp = { gte: windowStart };
  const [recruiterUsed, pairRows] = await Promise.all([
    client.recruit_history.count({
      where: {
        source: 'INTERNAL',
        to_user: recruiterId,
        from_user: { not: 0 },
        timestamp,
      },
    }),
    targetIds.length
      ? client.recruit_history.groupBy({
          by: ['from_user'],
          where: {
            source: 'INTERNAL',
            from_user: { in: targetIds },
            to_user: recruiterId,
            timestamp,
          },
          _count: { _all: true },
        })
      : [],
  ]);
  const toCounts = (
    rows: { from_user: number | null; _count: { _all: number } }[],
  ) => new Map(rows.map((row) => [row.from_user, row._count._all]));
  const pairUsed = toCounts(pairRows);
  return {
    pairLimit: RECRUIT_PAIR_DAILY_LIMIT,
    recruiterCap: await getRecruiterDailyCap(),
    targetCap: Number.MAX_SAFE_INTEGER,
    recruiterUsed,
    resetsAt: getOTStartDate(1).toISOString(),
    targets: Object.fromEntries(
      targetIds.map((id) => [
        String(id),
        {
          pairUsed: pairUsed.get(id) ?? 0,
          targetUsed: 0,
        },
      ]),
    ),
  };
};

const ensureRecruitmentLimit = async ({
  tx,
  windowStart,
  fromUser,
  toUser,
  ipAddress,
  strategy,
  errorMessage,
}: {
  tx: Prisma.TransactionClient;
  windowStart: Date;
  fromUser: number;
  toUser: number;
  ipAddress: string;
  strategy: RecruitmentLimitStrategy;
  errorMessage: string;
}) => {
  const baseTimeConstraint = { gte: windowStart };

  if (strategy === 'linkBased') {
    const history = await tx.recruit_history.count({
      where: {
        source: 'INTERNAL',
        OR: [
          {
            AND: [
              { to_user: toUser },
              { from_user: { not: 0 } },
              { from_user: fromUser },
              { timestamp: baseTimeConstraint },
            ],
          },
          {
            AND: [
              { to_user: toUser },
              { ip_addr: ipAddress },
              { timestamp: baseTimeConstraint },
            ],
          },
        ],
      },
    });

    if (history >= RECRUIT_PAIR_DAILY_LIMIT) {
      throw new Error(errorMessage);
    }
    return;
  }

  const recruitmentCount = await tx.recruit_history.count({
    where: {
      source: 'INTERNAL',
      from_user: fromUser,
      to_user: toUser,
      timestamp: baseTimeConstraint,
      ...(fromUser === 0 && { ip_addr: ipAddress }),
    },
  });

  if (recruitmentCount >= RECRUIT_PAIR_DAILY_LIMIT) {
    throw new Error(errorMessage);
  }
};

/** Perform recruitment. */
export const performRecruitment = async ({
  tx,
  fromUser,
  toUser,
  userIdToUpdate,
  ipAddress,
  strategy = 'standard',
  goldReward = 250,
  delayMs,
  sessionUpdate,
  context,
}: {
  tx: Prisma.TransactionClient;
  fromUser: number;
  toUser: number;
  userIdToUpdate: number;
  ipAddress: string;
  strategy?: RecruitmentLimitStrategy;
  goldReward?: number;
  delayMs?: number;
  sessionUpdate?: { sessionId: number; recruiterUserId: number } | null;
  context?: RecruitmentContext;
}) => {
  const resolvedContext = context ?? (await resolveRecruitmentContext(tx));
  // The limits depend on history, so concurrent requests must wait before reading it.
  // Lock both the recruiter and the target. Locks are taken in ascending ID order so
  // two opposite recruitments cannot deadlock each other.
  const lockIds = [...new Set([toUser, fromUser])]
    .filter((id) => id !== 0)
    .sort((a, b) => a - b);
  for (const lockId of lockIds) {
    await lockRecruitmentRecipient(tx, lockId);
  }
  // 0 is the system sender (anonymous link visits). Any other sender must exist,
  // otherwise arbitrary IDs would each get a fresh recruitment quota.
  if (fromUser !== 0) {
    const sender = await tx.users.findUnique({
      where: { id: fromUser },
      select: { id: true },
    });
    if (!sender) {
      throw new Error('Recruiter not found');
    }
  }
  const user = await getUserById(userIdToUpdate, tx as any);
  if (!user) {
    throw new Error('User not found');
  }

  const since = await getRecruitmentWindowStart(tx);
  await ensureRecruitmentLimit({
    tx,
    windowStart: since,
    fromUser,
    toUser,
    ipAddress,
    strategy,
    errorMessage:
      strategy === 'linkBased'
        ? 'You can only Recruit up to 5x in 24 hours.'
        : RECRUIT_PAIR_LIMIT_ERROR,
  });

  // Daily totals across all counterparties, checked inside the advisory locks.
  const recruiterTotal = await tx.recruit_history.count({
    where: {
      source: 'INTERNAL',
      to_user: toUser,
      from_user: { not: 0 },
      timestamp: { gte: since },
    },
  });
  if (recruiterTotal >= resolvedContext.internalDailyCap) {
    throw new Error(RECRUITER_DAILY_CAP_ERROR);
  }

  await tx.recruit_history.create({
    data: {
      source: 'INTERNAL',
      from_user: fromUser,
      to_user: toUser,
      ip_addr: ipAddress,
      timestamp: new Date(),
    },
  });

  if (delayMs && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  await grantRecruitmentReward(
    tx,
    userIdToUpdate,
    goldReward,
    resolvedContext.recruitCitizenMultiplier,
  );

  if (sessionUpdate?.sessionId) {
    await tx.autoRecruitSession.update({
      where: {
        id: sessionUpdate.sessionId,
        userId: sessionUpdate.recruiterUserId,
      },
      data: { lastActivityAt: new Date() },
    });
  }

  return { success: true };
};

/** Perform recruitment with session validation. */
export const performRecruitmentWithSessionValidation = async ({
  tx,
  fromUser,
  toUser,
  userIdToUpdate,
  ipAddress,
  strategy = 'standard',
  goldReward = 250,
  delayMs,
  sessionId,
  recruiterUserId,
  context,
}: {
  tx: Prisma.TransactionClient;
  fromUser: number;
  toUser: number;
  userIdToUpdate: number;
  ipAddress: string;
  strategy?: RecruitmentLimitStrategy;
  goldReward?: number;
  delayMs?: number;
  sessionId?: number | null;
  recruiterUserId: number;
  context?: RecruitmentContext;
}) => {
  // Validate session inside transaction if present
  if (sessionId) {
    const sessionData = await tx.autoRecruitSession.findUnique({
      where: { id: sessionId, userId: recruiterUserId },
    });

    if (!sessionData) {
      throw new Error('Invalid session ID');
    }

    if (sessionData.lastActivityAt < new Date(Date.now() - 60000)) {
      // 1 minute
      await tx.autoRecruitSession.deleteMany({
        where: { id: sessionId, userId: recruiterUserId },
      });
      throw new Error('Session expired');
    }
  }

  return performRecruitment({
    tx,
    fromUser,
    toUser,
    userIdToUpdate,
    ipAddress,
    strategy,
    goldReward,
    delayMs,
    context,
    sessionUpdate: sessionId ? { sessionId, recruiterUserId } : null,
  });
};

/**
 * Returns targets a signed-in recruiter can still recruit, honoring the
 * per-pair limit and the recruiter's aggregate internal daily cap.
 * When the recruiter is capped, usersLeft is empty and recruiterCapReached is set.
 */
export async function getValidUsersForRecruitment(recruiterID: number) {
  const since = await getRecruitmentWindowStart(prisma);
  // Fetch users excluding the recruiter and ID 0, created before OT start date
  const usersWithStatus = await prisma.users.findMany({
    where: {
      NOT: { id: { in: [0, recruiterID] } },
      created_at: { lt: since },
    },
    select: {
      recruit_link: true,
      id: true,
      display_name: true,
      race: true,
      class: true,
      experience: true,
      statusHistories: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: {
          status: true,
        },
      },
    },
  });

  // Filter users whose latest status is 'ACTIVE'
  const activeUsers = usersWithStatus.filter(
    (user) => user.statusHistories[0]?.status === 'ACTIVE',
  );

  const recruiterTotal = await prisma.recruit_history.count({
    where: {
      source: 'INTERNAL',
      to_user: recruiterID,
      from_user: { not: 0 },
      timestamp: { gte: since },
    },
  });
  const recruiterRemaining = Math.max(
    0,
    (await getRecruiterDailyCap()) - recruiterTotal,
  );
  const recruiterCapReached = recruiterRemaining === 0;

  if (activeUsers.length === 0 || recruiterCapReached) {
    return {
      usersLeft: [],
      activeUsers,
      recruiterRemaining,
      recruiterCapReached,
    };
  }

  const userIds = activeUsers.map((user) => user.id);

  // Other recruiters do not consume this actor's per-target allowance.
  const pairCounts = await prisma.recruit_history.groupBy({
    by: ['from_user'],
    where: {
      source: 'INTERNAL',
      to_user: recruiterID,
      from_user: { in: userIds },
      timestamp: { gte: since },
    },
    _count: { _all: true },
  });

  const pairMap = new Map<number, number>(
    pairCounts.map((row) => [row.from_user, row._count._all]),
  );

  const validUsers = activeUsers
    .map((user) => {
      const remainingRecruits = Math.min(
        RECRUIT_PAIR_DAILY_LIMIT - (pairMap.get(user.id) ?? 0),
        recruiterRemaining,
      );
      return remainingRecruits > 0 ? { user, remainingRecruits } : null;
    })
    .filter((entry) => entry !== null);

  return {
    usersLeft: validUsers,
    activeUsers,
    recruiterRemaining,
    recruiterCapReached,
  };
}

/** Returns recruitment records for callers that need normalized game data. */
export async function getRecruitmentRecords(
  recruiterID: number,
  startDate: Date,
  endDate: Date,
) {
  const recruitmentRecords = await prisma.recruit_history.findMany({
    where: {
      from_user: { not: { in: [0, recruiterID] } },
      source: 'INTERNAL',
      to_user: recruiterID,
      timestamp: {
        gte: startDate,
        lt: endDate,
      },
    },
    select: {
      from_user: true,
      timestamp: true,
      to_user: true,
    },
  });

  if (!recruitmentRecords.length) {
    return [];
  }

  // Count the number of times each user has been recruited
  const recruitCountMap: { [key: number]: number } = {};
  recruitmentRecords.forEach((record) => {
    recruitCountMap[record.from_user] =
      (recruitCountMap[record.from_user] || 0) + 1;
  });

  // Fetch user details for the recruited users
  const userIds = Object.keys(recruitCountMap).map((id) => parseInt(id));
  const recruitedUsers = await prisma.users.findMany({
    where: {
      id: { in: userIds },
    },
    select: {
      id: true,
      display_name: true,
      race: true,
      class: true,
      experience: true,
    },
    orderBy: {
      id: 'asc',
    },
  });

  // Add recruit count to user details
  const usersWithRecruitCount = recruitedUsers.map((user) => ({
    ...user,
    recruitCount: recruitCountMap[user.id],
  }));

  return usersWithRecruitCount;
}

/** Returns user by recruit link for callers that need normalized game data. */
export async function getUserByRecruitLink(recruitLink: string) {
  return prisma.users.findUnique({
    where: {
      recruit_link: recruitLink,
    },
  });
}

/** Returns the user with this ID, or null when no such player exists. */
export async function getRecruitTargetById(userId: number) {
  return prisma.users.findUnique({
    where: { id: userId },
    select: { id: true },
  });
}

/**
 * Picks a random target the recruiter can still recruit today. Returns the
 * reason instead when the recruiter is capped or no target is left, so the
 * client can stop rather than retry.
 */
export async function getRandomAutoRecruitUser(
  recruiterId: number,
): Promise<
  | { recruit_link: string; id: number }
  | { blocked: 'RECRUITER_DAILY_CAP_REACHED' | 'NO_RECRUITABLE_USERS' }
> {
  const { usersLeft, recruiterCapReached } =
    await getValidUsersForRecruitment(recruiterId);
  if (recruiterCapReached) return { blocked: 'RECRUITER_DAILY_CAP_REACHED' };
  if (!usersLeft.length) return { blocked: 'NO_RECRUITABLE_USERS' };
  const { user } = usersLeft[Math.floor(Math.random() * usersLeft.length)];
  return { recruit_link: user.recruit_link, id: user.id };
}

/** Shared event-aware reward math; external visits deliberately grant no gold. */
async function grantRecruitmentReward(
  tx: Prisma.TransactionClient,
  userIdToUpdate: number,
  goldReward: number,
  recruitCitizenMultiplier: number,
) {
  // A running citizen event (#86) can multiply the one citizen per recruit;
  // the extra citizens raise the protection population limit (#89).
  const citizensGranted = multiplyCount(1, recruitCitizenMultiplier);
  const eventCitizens = Math.max(0, citizensGranted - 1);

  await tx.users.update({
    where: { id: userIdToUpdate },
    data: {
      gold: { increment: goldReward },
      ...(eventCitizens > 0
        ? { event_citizens_received: { increment: eventCitizens } }
        : {}),
    },
  });

  if (citizensGranted > 0) {
    await tx.userUnit.upsert({
      where: {
        userId_type_level_isMercenary: {
          userId: userIdToUpdate,
          type: 'CITIZEN',
          level: 1,
          isMercenary: false,
        },
      },
      update: {
        quantity: { increment: citizensGranted },
        level: 1,
      },
      create: {
        userId: userIdToUpdate,
        type: 'CITIZEN',
        level: 1,
        quantity: citizensGranted,
        isMercenary: false,
      },
    });
  }

  await tx.bank_history.create({
    data: {
      from_user_id: 0,
      to_user_id: userIdToUpdate,
      to_user_account_type: 'HAND',
      from_user_account_type: 'BANK',
      date_time: new Date(),
      gold_amount: BigInt(goldReward),
      history_type: 'RECRUITMENT',
      ...(recruitCitizenMultiplier !== 1
        ? {
            stats: {
              citizensGranted,
              eventCitizenMultiplier: recruitCitizenMultiplier,
            },
          }
        : {}),
    },
  });
}

export const EXTERNAL_DAILY_CAP_ERROR =
  'This player has reached the daily external recruitment limit.';
export const IP_DAILY_CAP_ERROR =
  'You have reached the daily recruitment limit for this link.';

export async function getExternalRecruitmentStatus({
  db,
  ownerId,
  ipAddress,
  context,
}: {
  db?: PrismaClientOrTx;
  ownerId: number;
  ipAddress: string;
  context?: RecruitmentContext;
}) {
  const client = resolveDb(db);
  const since = await getRecruitmentWindowStart(client);
  const ownerWhere = {
    source: 'EXTERNAL' as const,
    to_user: ownerId,
    timestamp: { gte: since },
  };
  const config = context ? null : await getRuntimeConfig(db);
  const dailyCap =
    context?.externalDailyCap ?? validCap(config?.externalRecruitDailyCap, 25);
  const perIpCap =
    context?.externalIpDailyCap ??
    validCap(config?.externalRecruitIpDailyCap, 5);
  const [used, ipUsed] = await Promise.all([
    client.recruit_history.count({ where: ownerWhere }),
    client.recruit_history.count({
      where: { ...ownerWhere, ip_addr: ipAddress },
    }),
  ]);
  const remaining = Math.max(0, dailyCap - used);
  const perIpRemaining = Math.max(0, Math.min(remaining, perIpCap - ipUsed));
  const code =
    remaining === 0
      ? 'EXTERNAL_DAILY_CAP_REACHED'
      : perIpRemaining === 0
        ? 'IP_DAILY_CAP_REACHED'
        : null;
  return {
    showCaptcha: code === null,
    code,
    remaining,
    perIpRemaining,
    dailyCap,
    perIpCap,
    resetsAt: getOTStartDate(1).toISOString(),
  };
}

/** Public link visit: identity never changes the IP quota or reward recipient. */
export async function performExternalRecruitment({
  tx,
  ownerId,
  ipAddress,
  context,
}: {
  tx: Prisma.TransactionClient;
  ownerId: number;
  ipAddress: string;
  context?: RecruitmentContext;
}) {
  const resolvedContext = context ?? (await resolveRecruitmentContext(tx));
  // This lock serializes the owner's total and per-IP allowances while keeping
  // the same connection independent across different players' links.
  await lockRecruitmentRecipient(tx, ownerId);
  const owner = await tx.users.findUnique({
    where: { id: ownerId },
    select: { id: true },
  });
  if (!owner) throw new Error('User not found');
  const status = await getExternalRecruitmentStatus({
    db: tx,
    context: resolvedContext,
    ownerId,
    ipAddress,
  });
  if (status.code === 'EXTERNAL_DAILY_CAP_REACHED')
    throw new Error(EXTERNAL_DAILY_CAP_ERROR);
  if (status.code === 'IP_DAILY_CAP_REACHED')
    throw new Error(IP_DAILY_CAP_ERROR);
  await tx.recruit_history.create({
    data: {
      source: 'EXTERNAL',
      from_user: null,
      to_user: ownerId,
      ip_addr: ipAddress,
      timestamp: new Date(),
    },
  });
  await grantRecruitmentReward(
    tx,
    ownerId,
    0,
    resolvedContext.recruitCitizenMultiplier,
  );
  return { success: true };
}
