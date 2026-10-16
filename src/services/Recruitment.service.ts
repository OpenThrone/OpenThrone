import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { getUserById } from '@/services/AttackDataService';
import { lockRecruitmentRecipient } from '@/services/recruitmentGuards';
import { getOTStartDate } from '@/utils/timefunctions';

const CreateRecruitmentRecordSchema = z.object({
  fromUser: z.number().int(),
  toUser: z.number().int(),
  ipAddress: z.string().ip(),
});

const HasExceededRecruitmentLimitSchema = z.object({
  fromUser: z.number().int(),
  toUser: z.number().int(),
  ipAddress: z.string().ip(),
  recruiterUserId: z.number().int(),
});

const UpdateUserAfterRecruitmentSchema = z.object({
  userId: z.number().int().positive(),
});

const CreateBankHistoryRecordSchema = z.object({
  userId: z.number().int().positive(),
});

async function createRecruitmentRecord({
  fromUser,
  toUser,
  ipAddress,
}: {
  fromUser: number;
  toUser: number;
  ipAddress: string;
}) {
  const validatedData = CreateRecruitmentRecordSchema.parse({
    fromUser,
    toUser,
    ipAddress,
  });
  return prisma.recruit_history.create({
    data: {
      from_user: validatedData.fromUser,
      to_user: validatedData.toUser,
      ip_addr: validatedData.ipAddress,
      timestamp: new Date(),
    },
  });
}

async function hasExceededRecruitmentLimit({
  fromUser,
  toUser,
  ipAddress,
  recruiterUserId,
}: {
  fromUser: number;
  toUser: number;
  ipAddress: string;
  recruiterUserId: number;
}) {
  const validatedData = HasExceededRecruitmentLimitSchema.parse({
    fromUser,
    toUser,
    ipAddress,
    recruiterUserId,
  });
  const windowStart = await getRecruitmentWindowStart(prisma);
  const recruitments = await prisma.recruit_history.findMany({
    where: {
      from_user: validatedData.fromUser,
      to_user: validatedData.toUser,
      timestamp: { gte: windowStart },
      ...(validatedData.recruiterUserId === 0 && {
        ip_addr: validatedData.ipAddress,
      }),
    },
  });
  return recruitments.length >= 5;
}

async function updateUserAfterRecruitment(userId: number) {
  const validatedData = UpdateUserAfterRecruitmentSchema.parse({ userId });
  // Add 250 gold to the user
  await prisma.users.update({
    where: { id: validatedData.userId },
    data: {
      gold: { increment: 250 },
    },
  });
}

async function createBankHistoryRecord(userId: number) {
  const validatedData = CreateBankHistoryRecordSchema.parse({ userId });
  await prisma.bank_history.create({
    data: {
      from_user_id: 0,
      to_user_id: validatedData.userId,
      to_user_account_type: 'HAND',
      from_user_account_type: 'BANK',
      date_time: new Date(),
      gold_amount: 250,
      history_type: 'RECRUITMENT',
    },
  });
}

type RecruitmentLimitStrategy = 'standard' | 'linkBased';
type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

/**
 * Daily recruitment totals, reusing the existing 25-per-day allowance
 * (src/pages/api/recruit/[id].ts). Per-recruiter caps the recruiter's gold
 * claims across all targets; per-target caps the link owner's recruits across
 * all recruiters. The per-pair limit of 5 is enforced by ensureRecruitmentLimit.
 */
export const RECRUITER_DAILY_CAP = 25;
export const TARGET_DAILY_CAP = 25;

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
  const [recruiterTotal, targetTotal, pairTotal] = await Promise.all([
    client.recruit_history.count({
      where: { to_user: recruiterId, from_user: { not: 0 }, timestamp },
    }),
    client.recruit_history.count({
      where: { from_user: targetId, timestamp },
    }),
    client.recruit_history.count({
      where: { from_user: targetId, to_user: recruiterId, timestamp },
    }),
  ]);
  if (recruiterTotal >= RECRUITER_DAILY_CAP) {
    return 'RECRUITER_DAILY_CAP_REACHED';
  }
  if (targetTotal >= TARGET_DAILY_CAP) return 'TARGET_DAILY_CAP_REACHED';
  if (pairTotal >= RECRUIT_PAIR_DAILY_LIMIT) return 'PAIR_LIMIT_REACHED';
  return null;
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
}) => {
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
      to_user: toUser,
      from_user: { not: 0 },
      timestamp: { gte: since },
    },
  });
  if (recruiterTotal >= RECRUITER_DAILY_CAP) {
    throw new Error(RECRUITER_DAILY_CAP_ERROR);
  }
  if (fromUser !== 0) {
    const targetTotal = await tx.recruit_history.count({
      where: { from_user: fromUser, timestamp: { gte: since } },
    });
    if (targetTotal >= TARGET_DAILY_CAP) {
      throw new Error(TARGET_DAILY_CAP_ERROR);
    }
  }

  await tx.recruit_history.create({
    data: {
      from_user: fromUser,
      to_user: toUser,
      ip_addr: ipAddress,
      timestamp: new Date(),
    },
  });

  if (delayMs && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  await tx.users.update({
    where: { id: userIdToUpdate },
    data: {
      gold: { increment: goldReward },
    },
  });

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
      quantity: { increment: 1 },
      level: 1,
    },
    create: {
      userId: userIdToUpdate,
      type: 'CITIZEN',
      level: 1,
      quantity: 1,
      isMercenary: false,
    },
  });

  await tx.bank_history.create({
    data: {
      from_user_id: 0,
      to_user_id: userIdToUpdate,
      to_user_account_type: 'HAND',
      from_user_account_type: 'BANK',
      date_time: new Date(),
      gold_amount: BigInt(goldReward),
      history_type: 'RECRUITMENT',
    },
  });

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
    sessionUpdate: sessionId ? { sessionId, recruiterUserId } : null,
  });
};

/**
 * Returns the targets a signed-in recruiter can still recruit today, honouring
 * the per-pair limit, each target's daily cap and the recruiter's own daily cap.
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
      to_user: recruiterID,
      from_user: { not: 0 },
      timestamp: { gte: since },
    },
  });
  const recruiterRemaining = Math.max(0, RECRUITER_DAILY_CAP - recruiterTotal);
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

  // Recruits this recruiter already took from each target, and each target's
  // total across all recruiters, in one query each.
  const [pairCounts, targetCounts] = await Promise.all([
    prisma.recruit_history.groupBy({
      by: ['from_user'],
      where: {
        to_user: recruiterID,
        from_user: { in: userIds },
        timestamp: { gte: since },
      },
      _count: { _all: true },
    }),
    prisma.recruit_history.groupBy({
      by: ['from_user'],
      where: {
        from_user: { in: userIds },
        timestamp: { gte: since },
      },
      _count: { _all: true },
    }),
  ]);

  const pairMap = new Map<number, number>(
    pairCounts.map((row) => [row.from_user, row._count._all]),
  );
  const targetMap = new Map<number, number>(
    targetCounts.map((row) => [row.from_user, row._count._all]),
  );

  const validUsers = activeUsers
    .map((user) => {
      const remainingRecruits = Math.min(
        RECRUIT_PAIR_DAILY_LIMIT - (pairMap.get(user.id) ?? 0),
        TARGET_DAILY_CAP - (targetMap.get(user.id) ?? 0),
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

function increaseCitizens(units: any[]) {
  if (!Array.isArray(units)) return units;
  const citizen = units.find((u) => u.type === 'CITIZEN');
  if (citizen) {
    citizen.quantity = (citizen.quantity ?? 0) + 1;
  } else {
    units.push({ type: 'CITIZEN', level: 1, quantity: 1 });
  }
  return units;
}
