import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { mercenaryOffer, MercenaryService } from '@/services/Mercenary.service';
import { logError } from '@/utils/logger';
import { publicErrorMessage } from '@/utils/publicError';

const actionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('hire'),
      type: z.enum(['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY']),
      level: z.number().int().min(1).max(3),
      quantity: z.number().int().min(1).max(100),
      termDays: z.union([z.literal(1), z.literal(3), z.literal(7)]),
      operationId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('renew'),
      contractId: z.number().int().positive(),
      termDays: z.union([z.literal(1), z.literal(3), z.literal(7)]),
      operationId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('dismiss'),
      contractId: z.number().int().positive(),
      operationId: z.string().uuid(),
    })
    .strict(),
]);

const handler = async (req, res) => {
  if (!req.session) return res.status(401).json({ message: 'Unauthorized' });
  const userId = req.session.user.id;
  if (req.method === 'GET') {
    const contracts = await MercenaryService.list(userId);
    const offers = (['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'] as const).flatMap(
      (role) => [1, 2, 3].map((level) => mercenaryOffer(role, level)),
    );
    return res
      .status(200)
      .json(
        JSON.parse(
          JSON.stringify({ contracts, offers }, (_, value) =>
            typeof value === 'bigint' ? value.toString() : value,
          ),
        ),
      );
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  try {
    const { action, ...command } = actionSchema.parse(req.body);
    const contract =
      action === 'hire'
        ? await MercenaryService.hire({ userId, ...command } as Parameters<
            typeof MercenaryService.hire
          >[0])
        : await MercenaryService.change({ userId, ...command } as Parameters<
            typeof MercenaryService.change
          >[0]);
    return res.status(200).json({ contractId: contract.id });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ message: 'Invalid mercenary order' });
    const message = publicErrorMessage(error, 'Unable to process this order');
    if (
      /Insufficient|Maximum|Fort|tier|Contract|Operation ID|active|required/.test(
        message,
      )
    )
      return res.status(400).json({ message });
    logError(error);
    return res
      .status(500)
      .json({ message: 'Unable to process mercenary order' });
  }
};
export default withAuth(handler, { rateLimitProfile: 'game_write' });
