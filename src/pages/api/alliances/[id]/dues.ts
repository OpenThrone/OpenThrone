import { z } from 'zod';

import prisma from '@/lib/prisma';
import { withAuth } from '@/middleware/auth';
import {
  createForceLevy,
  designateForceCollection,
  payForceDues,
  saveForceDuesRule,
  waiveForceObligation,
} from '@/services/ForceDues.service';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';

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
    const member = await prisma.alliance_memberships.findUnique({
      where: {
        unique_alliance_user: { alliance_id: allianceId, user_id: userId },
      },
      include: { alliance: { select: { leader_id: true } } },
    });
    if (!member)
      return res
        .status(403)
        .json({ message: 'Current alliance membership is required' });
    if (req.method === 'GET') {
      const [obligations, rules] = await Promise.all([
        prisma.forceObligation.findMany({
          where: {
            allianceId,
            ...(member.alliance.leader_id === userId ? {} : { userId }),
          },
          orderBy: [{ dueAt: 'asc' }, { id: 'desc' }],
          take: 500,
        }),
        prisma.forceDuesRule.findMany({
          where: { allianceId },
          orderBy: [{ roleId: 'asc' }, { minLevel: 'desc' }],
        }),
      ]);
      return res
        .status(200)
        .json(
          JSON.parse(
            JSON.stringify({ obligations, rules }, (_, value) =>
              typeof value === 'bigint' ? value.toString() : value,
            ),
          ),
        );
    }
    const { action, ...command } = z
      .object({ action: z.enum(['levy', 'rule', 'pay', 'designate', 'waive']) })
      .passthrough()
      .parse(req.body);
    switch (action) {
      case 'levy':
        await createForceLevy(
          allianceId,
          userId,
          command as Parameters<typeof createForceLevy>[2],
        );
        break;
      case 'rule':
        await saveForceDuesRule(
          allianceId,
          userId,
          command as Parameters<typeof saveForceDuesRule>[2],
        );
        break;
      case 'pay':
        await payForceDues(
          allianceId,
          userId,
          command as Parameters<typeof payForceDues>[2],
        );
        break;
      case 'designate': {
        const c = z
          .object({
            obligationId: z.number().int().positive(),
            unitId: z.number().int().positive(),
            equipment: z.unknown(),
          })
          .strict()
          .parse(command);
        await designateForceCollection(
          allianceId,
          userId,
          c.obligationId,
          c.unitId,
          c.equipment,
        );
        break;
      }
      case 'waive':
        await waiveForceObligation(
          allianceId,
          userId,
          z
            .object({ obligationId: z.number().int().positive() })
            .strict()
            .parse(command).obligationId,
        );
        break;
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: 'Invalid dues order' });
    const message = publicErrorMessage(error, 'Unable to process this order');
    if (
      /required|Insufficient|not |must|Choose|exceeds|match|another|already|cancelled/i.test(
        message,
      ) &&
      !message.includes('prisma')
    )
      return res.status(400).json({ message });
    logError(error);
    return res.status(500).json({ message: 'Unable to process dues order' });
  }
};
export default withAuth(handler, { rateLimitProfile: 'game_write' });
