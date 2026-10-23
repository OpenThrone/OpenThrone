import { z } from 'zod';

import { ItemTypes } from '@/constants';
import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import {
  cancelAllianceForceRequest,
  extendAllianceForce,
} from '@/services/AllianceForceExtension.service';
import { TemporaryForceLedgerService as Ledger } from '@/services/TemporaryForceLedger.service';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';
import {
  ForcePolicySchema,
  ForceQuantitySchema,
  ForceTermSchema,
} from '@/utils/temporaryForces';

const id = z.number().int().positive();
const op = z.string().uuid();
const commandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('contribute'),
      unitId: id,
      quantity: ForceQuantitySchema,
      equipment: z.unknown(),
      operationId: op,
    })
    .strict(),
  z
    .object({
      action: z.literal('request'),
      reserveId: id,
      quantity: ForceQuantitySchema,
      termDays: ForceTermSchema,
      operationId: op,
    })
    .strict(),
  z
    .object({ action: z.literal('cancel'), contractId: id, operationId: op })
    .strict(),
  z
    .object({ action: z.literal('approve'), contractId: id, operationId: op })
    .strict(),
  z
    .object({ action: z.literal('recall'), contractId: id, operationId: op })
    .strict(),
  z
    .object({ action: z.literal('return'), contractId: id, operationId: op })
    .strict(),
  z
    .object({
      action: z.literal('extend'),
      contractId: id,
      days: ForceTermSchema,
      operationId: op,
    })
    .strict(),
  z
    .object({
      action: z.literal('approveExtension'),
      contractId: id,
      days: ForceTermSchema,
      operationId: op,
    })
    .strict(),
  z
    .object({ action: z.literal('policy'), settings: ForcePolicySchema })
    .strict(),
]);
const handler = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  const allianceId = Number(req.query.id);
  const userId = Number(req.session?.user?.id);
  if (!Number.isSafeInteger(allianceId) || allianceId <= 0)
    return res.status(400).json({ message: 'Invalid alliance' });
  try {
    const membership = await prisma.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: { alliance_id: allianceId, user_id: userId },
      },
      include: { alliance: true },
    });
    if (!membership)
      return res
        .status(403)
        .json({ message: 'Current alliance membership is required' });
    const isLeader = membership.alliance.leader_id === userId;
    if (req.method === 'GET') {
      const user = await prisma.users.findUniqueOrThrow({
        where: { id: userId },
        include: {
          UserUnit: {
            where: {
              isMercenary: false,
              quantity: { gt: 0 },
              type: { in: ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] },
            },
          },
          UserItem: { where: { quantity: { gt: 0 } } },
        },
      });
      const [reserves, contracts, roles, policy, members] = await Promise.all([
        prisma.forceReserve.findMany({
          where: { allianceId, eraId: user.currentEraId },
          orderBy: [{ type: 'asc' }, { level: 'asc' }],
        }),
        prisma.forceContract.findMany({
          where: {
            allianceId,
            eraId: user.currentEraId,
            ...(isLeader ? {} : { userId }),
            status: { in: ['ACTIVE', 'REQUESTED'] },
          },
          include: { user: { select: { display_name: true } } },
          orderBy: { id: 'desc' },
        }),
        prisma.alliance_roles.findMany({
          where: { alliance_id: allianceId },
          orderBy: { rank_order: 'asc' },
        }),
        prisma.allianceForcePolicy.findFirst({
          where: { allianceId },
          orderBy: { version: 'desc' },
        }),
        prisma.alliance_memberships.findMany({
          where: { alliance_id: allianceId },
          select: { user_id: true, user: { select: { display_name: true } } },
        }),
      ]);
      return res.status(200).json(
        JSON.parse(
          JSON.stringify(
            {
              allianceId,
              allianceName: membership.alliance.name,
              userId,
              isLeader,
              reserves,
              contracts,
              roles: roles.map(({ id, name }) => ({ id, name })),
              policy: ForcePolicySchema.parse(policy?.settings ?? {}),
              units: user.UserUnit,
              items: user.UserItem,
              catalog: ItemTypes.map(({ usage, type, level, name }) => ({
                usage,
                type,
                level,
                name,
              })),
              members,
            },
            (_, value) =>
              typeof value === 'bigint' ? value.toString() : value,
          ),
        ),
      );
    }
    const { action, ...command } = commandSchema.parse(req.body);
    if (
      'contractId' in command &&
      !(await prisma.forceContract.findFirst({
        where: { id: Number(command.contractId), allianceId },
      }))
    )
      return res
        .status(404)
        .json({ message: 'Contract not found in this alliance' });
    switch (action) {
      case 'policy':
        await Ledger.savePolicy(
          allianceId,
          userId,
          (command as { settings: unknown }).settings,
        );
        break;
      case 'contribute':
        await Ledger.contribute({
          allianceId,
          userId,
          ...command,
        } as Parameters<typeof Ledger.contribute>[0]);
        break;
      case 'request':
        await Ledger.requestLoan({
          allianceId,
          userId,
          ...command,
        } as Parameters<typeof Ledger.requestLoan>[0]);
        break;
      case 'cancel': {
        const c = command as { contractId: number; operationId: string };
        await cancelAllianceForceRequest(c.contractId, userId, c.operationId);
        break;
      }
      case 'approve':
        await Ledger.approveLoan({ actorId: userId, ...command } as Parameters<
          typeof Ledger.approveLoan
        >[0]);
        break;
      case 'recall':
      case 'return': {
        const c = command as { contractId: number; operationId: string };
        const contract = await prisma.forceContract.findFirst({
          where: { id: c.contractId, allianceId },
        });
        if (!contract)
          return res
            .status(404)
            .json({ message: 'Contract not found in this alliance' });
        await Ledger.closeContract({
          ...c,
          actorId: userId,
          reason: action === 'recall' ? 'RECALLED' : 'DISMISSED',
        });
        break;
      }
      case 'extend':
      case 'approveExtension':
        await extendAllianceForce({
          ...command,
          actorId: userId,
          approve: action === 'approveExtension',
        } as Parameters<typeof extendAllianceForce>[0]);
        break;
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: 'Invalid troop order' });
    const message = publicErrorMessage(error, 'Unable to process this order');
    if (
      /required|Insufficient|not |No |limit|exceeds|unlocked|missing|cannot|expired|pending|changed|another|capacity|already|active|available|policy|suspended/i.test(
        message,
      ) &&
      !message.includes('prisma')
    )
      return res.status(400).json({ message });
    logError(error);
    return res
      .status(500)
      .json({ message: 'Unable to process alliance troop order' });
  }
};
export default withAuth(handler, { rateLimitProfile: 'game_write' });
