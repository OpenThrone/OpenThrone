import { z } from 'zod';

import { hasAlliancePermission } from '@/constants/alliancePermissions';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';

export const ReportShareActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('player'),
    userId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('alliance'),
    allianceId: z.number().int().positive(),
  }),
  z.object({ action: z.literal('public'), enabled: z.boolean() }),
  z.object({
    action: z.literal('revoke'),
    grantId: z.number().int().positive(),
  }),
]);
export type ReportShareAction = z.infer<typeof ReportShareActionSchema>;

export class ReportSharingError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** All management paths require participation, even if the report is public. */
async function requireParticipant(
  tx: Prisma.TransactionClient,
  logId: number,
  userId: number,
) {
  const log = await tx.attack_log.findUnique({
    where: { id: logId },
    select: { attacker_id: true, defender_id: true, timestamp: true },
  });
  const era = await tx.era.findFirst({
    where: { endDate: null },
    orderBy: { startDate: 'desc' },
  });
  if (
    !log ||
    !era ||
    !log.timestamp ||
    log.timestamp < era.startDate ||
    (log.attacker_id !== userId && log.defender_id !== userId)
  ) {
    throw new ReportSharingError('Report not found', 404);
  }
  return log;
}

export async function getReportSharing(logId: number, userId: number) {
  const log = await requireParticipant(prisma, logId, userId);
  const [grants, memberships] = await Promise.all([
    prisma.attack_log_acl.findMany({
      where: { attack_log_id: logId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        is_public: true,
        shared_with_user: { select: { id: true, display_name: true } },
        shared_with_alliance: { select: { id: true, name: true } },
      },
    }),
    prisma.alliance_memberships.findMany({
      where: { user_id: userId },
      include: {
        role: true,
        alliance: { select: { id: true, name: true, leader_id: true } },
      },
    }),
  ]);
  return {
    isPublic: grants.some((g) => g.is_public),
    canReportThreat: log.defender_id === userId,
    grants: grants
      .filter((g) => !g.is_public)
      .map((g) => ({
        id: g.id,
        kind: g.shared_with_alliance
          ? ('alliance' as const)
          : ('player' as const),
        name:
          g.shared_with_alliance?.name ??
          g.shared_with_user?.display_name ??
          '',
      })),
    alliances: memberships
      .filter((m) =>
        hasAlliancePermission(
          m.alliance.leader_id,
          userId,
          m.role,
          'share_reports',
        ),
      )
      .map((m) => ({
        id: m.alliance.id,
        name: m.alliance.name,
        alreadyShared: grants.some(
          (g) => g.shared_with_alliance?.id === m.alliance.id,
        ),
      })),
  };
}
export type ReportSharingState = Awaited<ReturnType<typeof getReportSharing>>;

export async function updateReportSharing(
  logId: number,
  userId: number,
  input: ReportShareAction,
) {
  const action = ReportShareActionSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    // Serialize grant/revoke operations on a report, including duplicate clicks.
    await tx.$queryRaw`SELECT id FROM attack_log WHERE id = ${logId} FOR UPDATE`;
    const log = await requireParticipant(tx, logId, userId);
    if (action.action === 'revoke') {
      const grant = await tx.attack_log_acl.findFirst({
        where: { id: action.grantId, attack_log_id: logId },
      });
      if (!grant) throw new ReportSharingError('Share not found', 404);
      if (grant.shared_with_alliance_id) {
        await tx.alliance_intel_shares.deleteMany({
          where: {
            attack_log_id: logId,
            alliance_id: grant.shared_with_alliance_id,
          },
        });
      }
      await tx.attack_log_acl.delete({ where: { id: grant.id } });
      return;
    }
    if (action.action === 'public') {
      if (!action.enabled) {
        await tx.attack_log_acl.deleteMany({
          where: { attack_log_id: logId, is_public: true },
        });
        return;
      }
      await tx.attack_log_acl.createMany({
        data: [{ attack_log_id: logId, is_public: true }],
        skipDuplicates: true,
      });
      return;
    }
    if (action.action === 'player') {
      if (
        action.userId === log.attacker_id ||
        action.userId === log.defender_id
      ) {
        throw new ReportSharingError(
          'Battle participants already have access',
          400,
        );
      }
      const player = await tx.users.findUnique({
        where: { id: action.userId },
        select: { id: true },
      });
      if (!player) throw new ReportSharingError('Player not found', 404);
      await tx.attack_log_acl.createMany({
        data: [{ attack_log_id: logId, shared_with_user_id: action.userId }],
        skipDuplicates: true,
      });
      return;
    }
    const membership = await tx.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: {
          alliance_id: action.allianceId,
          user_id: userId,
        },
      },
      include: { role: true, alliance: { select: { leader_id: true } } },
    });
    if (
      !membership ||
      !hasAlliancePermission(
        membership.alliance.leader_id,
        userId,
        membership.role,
        'share_reports',
      )
    ) {
      throw new ReportSharingError(
        'You do not have permission to share reports with this alliance',
        403,
      );
    }
    await tx.attack_log_acl.createMany({
      data: [
        { attack_log_id: logId, shared_with_alliance_id: action.allianceId },
      ],
      skipDuplicates: true,
    });
    await tx.alliance_intel_shares.upsert({
      where: {
        unique_alliance_intel_share: {
          alliance_id: action.allianceId,
          attack_log_id: logId,
        },
      },
      create: {
        alliance_id: action.allianceId,
        attack_log_id: logId,
        shared_by: userId,
      },
      update: {},
    });
  });
  return getReportSharing(logId, userId);
}
