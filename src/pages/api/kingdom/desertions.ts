import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { withApiGuard } from '@/middleware/apiGuard';
import type { AuthenticatedRequest } from '@/types/api';

const guardedHandler = withApiGuard({
  methods: ['GET'],
  authMode: 'required',
  rateLimitProfile: 'public_read',
});

/** Last 20 desertion events for the signed-in kingdom (#205): units it lost and defectors it received. */
const handler = async (req: AuthenticatedRequest, res: NextApiResponse) => {
  const userId = Number(req.session?.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const events = await prisma.desertionEvent.findMany({
    where: { OR: [{ userId }, { defectedToUserId: userId }] },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      kind: true,
      unitType: true,
      unitLevel: true,
      quantity: true,
      createdAt: true,
      // Read only: decides the row's direction, never returned.
      defectedToUserId: true,
    },
  });

  // Only the fields the ledger renders cross this boundary: no userIds of
  // other kingdoms (loser or recipient) leak with a row.
  return res.status(200).json({
    desertions: events.map((event) => ({
      id: event.id,
      kind: event.kind,
      /** `lost` = units that left this kingdom; `received` = defectors that joined it. */
      direction: event.defectedToUserId === userId ? 'received' : 'lost',
      unitType: event.unitType,
      unitLevel: event.unitLevel,
      quantity: event.quantity,
      createdAt: event.createdAt.toISOString(),
    })),
  });
};

export default guardedHandler(handler);
