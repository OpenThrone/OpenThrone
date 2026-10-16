import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';

/** Server policy also applies to sessions created before maintenance began. */
export const isLoginDisabled = async () => {
  const config = await getRuntimeConfig();
  return config.disableLogin || config.eraResetInProgress === true;
};

const ACTIVE_STAFF_WHERE: Prisma.usersWhereInput = {
  staffRoleAssignments: {
    some: { role: { in: ['ADMINISTRATOR', 'MODERATOR'] }, revokedAt: null },
  },
};

export async function canAccessGame(userId: number): Promise<boolean> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return false;
  if (!(await isLoginDisabled())) return true;
  const assignment = await prisma.staffRoleAssignment.findFirst({
    where: {
      userId,
      role: { in: ['ADMINISTRATOR', 'MODERATOR'] },
      revokedAt: null,
    },
    select: { id: true },
  });
  return !!assignment;
}

/** Registration or era assignment alone does not establish participation. */
export async function getEraParticipantWhere(era: {
  id: number;
  startDate: Date;
}): Promise<Prisma.usersWhereInput> {
  return {
    id: { gt: 0 },
    currentEraId: era.id,
    last_active: { gte: era.startDate },
    ...((await isLoginDisabled()) ? ACTIVE_STAFF_WHERE : {}),
  };
}
