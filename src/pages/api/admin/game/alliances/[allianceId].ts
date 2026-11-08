import type { NextApiResponse } from 'next';
import { z } from 'zod';

import {
  ALLIANCE_ADMIN_AUDIT_ACTIONS,
  type AllianceAdminAction,
  AllianceAdminActionSchema,
  loanRemaining,
  OPEN_LOAN_STATUSES,
} from '@/components/admin/allianceAdminActions';
import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import {
  AllianceLoanStatus,
  PermissionType,
  WarStatus,
} from '@/lib/prisma-exports';
import { evictUserFromAllianceChatRooms } from '@/lib/socket';
import { withApiGuard } from '@/middleware/apiGuard';
import {
  ALLIANCE_BANK_TX_OPTIONS,
  lockAllianceThenUsers,
} from '@/services/AllianceBank.service';
import { cancelPendingGoldRequests } from '@/services/AllianceGoldRequest.service';
import {
  settleLoanCreditsInTx,
  settleLoansOnExit,
} from '@/services/AllianceLoan.service';
import {
  AllianceReactivationError,
  setAllianceStatusAsAdmin,
} from '@/services/AllianceReactivation.service';
import { lockAllianceChatRooms } from '@/services/chatRoomGuards';
import { returnMemberForcesInTx } from '@/services/ForceLifecycle.service';
import type { AuthenticatedRequest } from '@/types/api';
import { recomputeStoredStatsInTx } from '@/utils/adminRecomputeStats';
import { getRequestIp, logActionStrict } from '@/utils/auditLogger';
import { lockEraLifecycleShared } from '@/utils/eraLifecycleLock';
import { logError } from '@/utils/logger';
import { stringifyObj } from '@/utils/numberFormatting';

const QuerySchema = z.object({
  allianceId: z.coerce.number().int().positive(),
});

const HISTORY_LIMIT = 100;
const userRef = { select: { id: true, display_name: true } } as const;

/** Thrown for a refused action; reported to the admin as a 400. */
class AdminActionError extends Error {}

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  authMode: 'permission',
  // Same permission as the dissolve endpoint (alliances/index.ts).
  requiredAnyPermissions: [PermissionType.MANAGE_ALLIANCES],
  rateLimitProfile: 'admin',
  querySchema: QuerySchema,
  bodySchema: AllianceAdminActionSchema,
});

const loadDetail = async (allianceId: number) => {
  const alliance = await prisma.alliances.findUnique({
    where: { id: allianceId },
    include: { leader: userRef, xp_record: true },
  });
  if (!alliance) return null;
  const warWhere = {
    OR: [
      { attacker_alliance_id: allianceId },
      { defender_alliance_id: allianceId },
    ],
  };
  const [
    members,
    roles,
    cooldowns,
    bankHistory,
    goldRequests,
    loans,
    fees,
    wars,
    joinRequests,
    upgrades,
    relations,
    targetCalls,
    intelCount,
  ] = await Promise.all([
    prisma.alliance_memberships.findMany({
      where: { alliance_id: allianceId },
      include: {
        user: userRef,
        role: { select: { id: true, name: true, rank_order: true } },
      },
      orderBy: { created_at: 'asc' },
    }),
    prisma.alliance_roles.findMany({
      where: { alliance_id: allianceId },
      select: { id: true, name: true, rank_order: true },
      orderBy: { rank_order: 'asc' },
    }),
    prisma.alliance_cooldowns.findMany({
      where: { alliance_id: allianceId, expires_at: { gt: new Date() } },
      include: { user: userRef },
      orderBy: { expires_at: 'desc' },
    }),
    prisma.alliance_bank_history.findMany({
      where: { alliance_id: allianceId },
      include: { related_user: userRef, performed_by_user: userRef },
      orderBy: { created_at: 'desc' },
      take: HISTORY_LIMIT,
    }),
    prisma.alliance_gold_requests.findMany({
      where: { alliance_id: allianceId },
      include: { requester: userRef, decider: userRef },
      orderBy: { created_at: 'desc' },
      take: HISTORY_LIMIT,
    }),
    prisma.alliance_loans.findMany({
      where: { alliance_id: allianceId },
      include: { borrower: userRef, decider: userRef },
      orderBy: { created_at: 'desc' },
      take: HISTORY_LIMIT,
    }),
    prisma.alliance_fees.findMany({ where: { alliance_id: allianceId } }),
    prisma.alliance_wars.findMany({
      where: warWhere,
      include: {
        attacker_alliance: { select: { id: true, name: true } },
        defender_alliance: { select: { id: true, name: true } },
        defender_user: userRef,
        declared_by_user: userRef,
        targets: { include: { target_user: userRef } },
      },
      orderBy: { created_at: 'desc' },
      take: HISTORY_LIMIT,
    }),
    prisma.alliance_join_requests.findMany({
      where: { alliance_id: allianceId, status: 'PENDING' },
      include: { user: userRef },
      orderBy: { created_at: 'desc' },
    }),
    prisma.alliance_upgrades.findMany({
      where: { alliance_id: allianceId },
      orderBy: { purchased_at: 'desc' },
    }),
    prisma.alliance_relations.findMany({
      where: {
        OR: [{ alliance_id: allianceId }, { other_alliance_id: allianceId }],
      },
      include: {
        alliance: { select: { id: true, name: true } },
        other_alliance: { select: { id: true, name: true } },
      },
    }),
    prisma.alliance_target_calls.findMany({
      where: { alliance_id: allianceId, status: 'OPEN' },
      include: { target_user: userRef },
      orderBy: { created_at: 'desc' },
      take: HISTORY_LIMIT,
    }),
    prisma.alliance_intel_shares.count({ where: { alliance_id: allianceId } }),
  ]);
  return {
    alliance,
    members,
    roles,
    cooldowns,
    treasury: {
      balance: alliance.gold_in_bank ?? 0n,
      bankHistory,
      goldRequests,
      loans,
      fees,
    },
    wars,
    joinRequests,
    upgrades,
    relations,
    targetCalls,
    intelCount,
  };
};

type ActionResult = {
  message: string;
  targetUserId?: number | null;
  details: Record<string, unknown>;
  /** Members to evict from the alliance chat rooms after commit. */
  evictUserId?: number;
};

/**
 * Runs one admin action. Each branch mirrors the player-side service's
 * locking and invariants, minus the acting member's alliance permissions.
 */
const runAction = async (
  tx: Prisma.TransactionClient,
  allianceId: number,
  input: AllianceAdminAction,
  adminUserId: number,
): Promise<ActionResult> => {
  const loadAlliance = async () => {
    const alliance = await tx.alliances.findUnique({
      where: { id: allianceId },
      select: { id: true, name: true, leader_id: true },
    });
    if (!alliance) throw new AdminActionError('Alliance not found');
    return alliance;
  };

  switch (input.action) {
    case 'transfer_leadership': {
      // AllianceService.transferLeadership, without the caller-is-leader check.
      const current = await tx.alliances.findUnique({
        where: { id: allianceId },
        select: { leader_id: true },
      });
      if (!current) throw new AdminActionError('Alliance not found');
      await lockAllianceThenUsers(tx, allianceId, [
        current.leader_id,
        input.newLeaderId,
      ]);
      const alliance = await loadAlliance();
      if (alliance.leader_id !== current.leader_id)
        throw new AdminActionError('Leadership changed; reload and retry');
      if (input.newLeaderId === alliance.leader_id)
        throw new AdminActionError('That player already leads this alliance');
      const membership = await tx.alliance_memberships.findUnique({
        where: {
          unique_alliance_user: {
            alliance_id: allianceId,
            user_id: input.newLeaderId,
          },
        },
      });
      if (!membership)
        throw new AdminActionError(
          'New leader must be a member of the alliance',
        );
      const otherLed = await tx.alliances.findFirst({
        where: { leader_id: input.newLeaderId, id: { not: allianceId } },
        select: { id: true },
      });
      if (otherLed)
        throw new AdminActionError('New leader already leads another alliance');
      const changed = await tx.alliances.updateMany({
        where: { id: allianceId, leader_id: alliance.leader_id },
        data: { leader_id: input.newLeaderId },
      });
      if (changed.count !== 1)
        throw new AdminActionError('Leadership changed; reload and retry');
      return {
        message: 'Leadership transferred',
        targetUserId: input.newLeaderId,
        details: {
          previousLeaderId: alliance.leader_id,
          newLeaderId: input.newLeaderId,
        },
      };
    }

    case 'rename': {
      await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;
      const alliance = await loadAlliance();
      if (alliance.name === input.name)
        throw new AdminActionError('The alliance already has that name');
      // Same uniqueness rule as AllianceService.validateAllianceCreation.
      const taken = await tx.alliances.findFirst({
        where: { name: input.name, id: { not: allianceId } },
        select: { id: true },
      });
      if (taken)
        throw new AdminActionError('An alliance with this name already exists');
      await tx.alliances.update({
        where: { id: allianceId },
        data: { name: input.name },
      });
      return {
        message: 'Alliance renamed',
        details: { previousName: alliance.name, name: input.name },
      };
    }

    case 'remove_member': {
      // AllianceService.kickMember, without the kicker's rank checks.
      await lockAllianceChatRooms(tx, allianceId);
      await tx.$queryRaw`SELECT id FROM alliances WHERE id = ${allianceId} FOR UPDATE`;
      const alliance = await loadAlliance();
      if (input.userId === alliance.leader_id)
        throw new AdminActionError(
          'Cannot remove the leader; transfer leadership first',
        );
      const membership = await tx.alliance_memberships.findUnique({
        where: {
          unique_alliance_user: {
            alliance_id: allianceId,
            user_id: input.userId,
          },
        },
      });
      if (!membership)
        throw new AdminActionError('Member not found in alliance');
      await returnMemberForcesInTx(tx, allianceId, input.userId);
      // Returned contract troops leave the member's roster; only the
      // borrower's units change (reserves are alliance-owned), so refresh
      // their cached offense/defense in the same transaction.
      await recomputeStoredStatsInTx(tx, input.userId);
      await tx.alliance_memberships.delete({ where: { id: membership.id } });
      await cancelPendingGoldRequests(tx, allianceId, input.userId);
      // Collects what it can; any remainder is written off (kick semantics).
      await settleLoansOnExit(tx, allianceId, input.userId, 'kick');
      return {
        message: 'Member removed',
        targetUserId: input.userId,
        details: { userId: input.userId },
        evictUserId: input.userId,
      };
    }

    case 'clear_cooldowns': {
      await loadAlliance();
      const cleared = await tx.alliance_cooldowns.deleteMany({
        where: { alliance_id: allianceId, user_id: input.userId },
      });
      if (cleared.count === 0)
        throw new AdminActionError('No cooldown to clear');
      return {
        message: 'Cooldowns cleared',
        targetUserId: input.userId,
        details: { userId: input.userId, cleared: cleared.count },
      };
    }

    case 'forgive_loan':
    case 'cancel_loan': {
      const peek = await tx.alliance_loans.findFirst({
        where: { id: input.loanId, alliance_id: allianceId },
        select: { borrower_id: true },
      });
      if (!peek) throw new AdminActionError('Loan not found');
      // Same lock order as AllianceLoanService.decide / processOverdueLoans.
      await lockAllianceThenUsers(tx, allianceId, [peek.borrower_id]);
      const forgive = input.action === 'forgive_loan';
      if (forgive) {
        // Parked repayments belong to the treasury before the write-off.
        await settleLoanCreditsInTx(tx, allianceId);
      }
      const loan = await tx.alliance_loans.findFirst({
        where: { id: input.loanId, alliance_id: allianceId },
      });
      if (!loan) throw new AdminActionError('Loan not found');
      const from = forgive
        ? [...OPEN_LOAN_STATUSES].map((s) => AllianceLoanStatus[s])
        : [AllianceLoanStatus.REQUESTED];
      const to = forgive
        ? AllianceLoanStatus.WRITTEN_OFF
        : AllianceLoanStatus.CANCELLED;
      const flipped = await tx.alliance_loans.updateMany({
        where: { id: loan.id, status: { in: from } },
        data: { status: to, closed_at: new Date() },
      });
      if (flipped.count !== 1)
        throw new AdminActionError(
          forgive
            ? 'Only an active or defaulted loan can be forgiven'
            : 'Only a pending loan request can be cancelled',
        );
      return {
        message: forgive ? 'Loan forgiven' : 'Loan request cancelled',
        targetUserId: loan.borrower_id,
        details: {
          loanId: loan.id,
          previousStatus: loan.status,
          status: to,
          principal: loan.principal.toString(),
          outstanding: loanRemaining(loan).toString(),
        },
      };
    }

    case 'reserve':
    case 'reactivate': {
      // Staff override of the era lifecycle (#13).
      const target = input.action === 'reserve' ? 'RESERVED' : 'ACTIVE';
      try {
        const result = await setAllianceStatusAsAdmin(
          tx,
          allianceId,
          target,
          adminUserId,
        );
        return {
          message:
            target === 'RESERVED'
              ? 'Alliance reserved'
              : 'Alliance reactivated',
          details: result,
        };
      } catch (error) {
        if (error instanceof AllianceReactivationError)
          throw new AdminActionError(error.message);
        throw error;
      }
    }

    case 'end_war': {
      // AllianceWarService.endWar, without the declare_war permission check.
      await tx.$queryRaw`SELECT id FROM alliance_wars WHERE id = ${input.warId} FOR UPDATE`;
      const war = await tx.alliance_wars.findFirst({
        where: {
          id: input.warId,
          OR: [
            { attacker_alliance_id: allianceId },
            { defender_alliance_id: allianceId },
          ],
        },
        select: { id: true, status: true },
      });
      if (!war || war.status === WarStatus.ENDED)
        throw new AdminActionError('War not found or already over');
      await tx.alliance_wars.updateMany({
        where: { id: war.id, status: { not: WarStatus.ENDED } },
        data: { status: WarStatus.ENDED, end_at: new Date() },
      });
      return {
        message: 'War ended',
        details: { warId: war.id, previousStatus: war.status },
      };
    }
  }
};

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    query: z.infer<typeof QuerySchema>;
    body: z.infer<typeof AllianceAdminActionSchema>;
  },
) {
  const { allianceId } = context.query;

  if (req.method === 'GET') {
    try {
      const detail = await loadDetail(allianceId);
      if (!detail) return res.status(404).json({ error: 'Alliance not found' });
      return res.status(200).json(stringifyObj(detail));
    } catch (err) {
      logError('Failed to load alliance detail:', err);
      return res.status(500).json({ error: 'Failed to load alliance' });
    }
  }

  if (req.method === 'POST') {
    const input = context.body;
    try {
      const result = await prisma.$transaction(async (tx) => {
        await lockEraLifecycleShared(tx);
        const outcome = await runAction(
          tx,
          allianceId,
          input,
          Number(req.session?.user?.id),
        );
        // Commits with the change; a failed write rolls it back.
        await logActionStrict(
          {
            userId: Number(req.session?.user?.id),
            action: ALLIANCE_ADMIN_AUDIT_ACTIONS[input.action],
            ip: getRequestIp(req),
            targetUserId: outcome.targetUserId ?? null,
            entityType: 'Alliance',
            entityId: allianceId,
            details: outcome.details,
          },
          tx,
        );
        return outcome;
      }, ALLIANCE_BANK_TX_OPTIONS);
      if (result.evictUserId) {
        await evictUserFromAllianceChatRooms(result.evictUserId, allianceId);
      }
      return res.status(200).json({ success: true, message: result.message });
    } catch (err) {
      if (err instanceof AdminActionError) {
        return res.status(400).json({ error: err.message });
      }
      logError('Admin alliance action failed:', { allianceId, input, err });
      return res.status(500).json({ error: 'Action failed' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
