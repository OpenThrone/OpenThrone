import prisma from '@/lib/prisma';
import { PlayerUnit } from '@/types/typings';
import { getOTStartDate } from '@/utils/timefunctions';

export async function createRecruitmentRecord({
  fromUser,
  toUser,
  ipAddress,
}: {
  fromUser: number;
  toUser: number;
  ipAddress: string;
}) {
  return prisma.recruit_history.create({
    data: {
      from_user: fromUser,
      to_user: toUser,
      ip_addr: ipAddress,
      timestamp: new Date(),
    },
  });
}

export async function hasExceededRecruitmentLimit({
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
  const recruitments = await prisma.recruit_history.findMany({
    where: {
      from_user: fromUser,
      to_user: toUser,
      timestamp: { gte: getOTStartDate() },
      ...(recruiterUserId === 0 && {
        ip_addr: ipAddress,
      }),
    },
  });
  console.log(recruitments.length, 'fromUser:', fromUser, 'toUser:', toUser, 'ipAddress:', ipAddress, getOTStartDate());
  return recruitments.length >= 5;
}

export async function updateUserAfterRecruitment(userId: number, units: PlayerUnit[]) {
  const updatedUnits = increaseCitizens(units);
  await prisma.users.update({
    where: { id: userId },
    data: {
      units: updatedUnits,
      gold: { increment: 250 },
    },
  });
}

export async function createBankHistoryRecord(userId: number) {
  await prisma.bank_history.create({
    data: {
      from_user_id: 0,
      to_user_id: userId,
      to_user_account_type: 'HAND',
      from_user_account_type: 'BANK',
      date_time: new Date(),
      gold_amount: 250,
      history_type: 'RECRUITMENT',
    },
  });
}

export function increaseCitizens(units: PlayerUnit[]) {
  const citizen = units.find((unit) => unit.type === 'CITIZEN');
  if (citizen) {
    citizen.quantity += 1;
  } else {
    units.push({ type: 'CITIZEN', level: 1, quantity: 1 });
  }
  return units;
}

export async function getValidUsersForRecruitment(recruiterID: number, ipAddress: string) {
  // Fetch users excluding the recruiter and ID 0, created before OT start date
  const usersWithStatus = await prisma.users.findMany({
    where: {
      NOT: { id: { in: [0, recruiterID] } },
      created_at: { lt: getOTStartDate() },
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
    (user) => user.statusHistories[0]?.status === 'ACTIVE'
  );

  if (activeUsers.length === 0) {
    return [];
  }

  // Extract user IDs
  const userIds = activeUsers.map((user) => user.id);

  // Fetch recruitment counts for all active users in one query
  const recruitments = await prisma.recruit_history.groupBy({
    by: ['from_user'],
    where: {
      to_user: recruiterID,
      from_user: { in: userIds },
      timestamp: { gte: getOTStartDate() },
      ...(recruiterID === 0 && { ip_addr: ipAddress }),
    },
    _count: {
      _all: true,
    },
  });

  // Initialize counts map with all active users set to 0
  const countsMap: { [key: number]: number } = userIds.reduce((acc, userId) => {
    acc[userId] = 0;
    return acc;
  }, {} as { [key: number]: number });

  // Update countsMap with actual recruitment counts
  recruitments.forEach((recruitment) => {
    countsMap[recruitment.from_user] = recruitment._count._all;
  });

  // Calculate remaining recruits and filter valid users
  const validUsers = activeUsers
    .map((user) => {
      const recruitmentCount = countsMap[user.id] || 0;
      const remainingRecruits = 5 - recruitmentCount;
      if (remainingRecruits > 0) {
        return { user, remainingRecruits };
      }
      return null;
    })
    .filter((entry) => entry !== null);

  return { usersLeft: validUsers || 0, activeUsers };
}

export async function getRecruitmentRecords(recruiterID: number, startDate: Date, endDate: Date) {
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
    recruitCountMap[record.from_user] = (recruitCountMap[record.from_user] || 0) + 1;
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