import { randomUUID } from 'node:crypto';

import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { supporterGuard } from '@/services/supporter/admin';
import { assertMockAllowed } from '@/services/supporter/MockProvider';
import { processPaymentEvent } from '@/services/supporter/PaymentEvents.service';
import type { AuthenticatedRequest } from '@/types/api';

const schema = z.object({
  type: z.enum([
    'invoice.paid',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'charge.dispute.created',
    'charge.refunded',
  ]),
  summary: z
    .object({
      userId: z.number().int().positive().optional(),
      paymentId: z.number().int().positive().optional(),
      amountCents: z.number().int().positive().optional(),
      periodEnd: z.string().datetime().optional(),
      cancelAtPeriodEnd: z.boolean().optional(),
      providerPaymentId: z.string().max(200).optional(),
      providerInvoiceId: z.string().max(200).optional(),
      refundId: z.string().max(200).optional(),
      reason: z.string().max(500).optional(),
    })
    .strict(),
});
async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
    assertMockAllowed();
    const input = schema.parse(req.body);
    if (!input.type || !input.summary) throw new Error('Invalid event');
    const result = await processPaymentEvent({
      provider: 'mock',
      providerEventId: `mock:${randomUUID()}`,
      type: input.type,
      summary: input.summary,
    });
    return res.json(result);
  } catch {
    return res.status(400).json({ error: 'Mock event failed' });
  }
}
export default supporterGuard(['POST'])(handler);
