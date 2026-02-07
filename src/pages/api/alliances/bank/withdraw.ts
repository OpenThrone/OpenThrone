import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { enforceIdempotency } from '@/middleware/idempotency';
import { AllianceBankService } from '@/services';

const WithdrawDetailsSchema = z.object({
  allianceId: z.number().int().positive(),
  targetUserId: z.number().int().positive(),
  amount: z.coerce.bigint().min(BigInt(1), 'Amount must be positive'),
  notes: z.string().optional(),
});

const withdrawHandler = async (req: any, res: any) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const validatedBody = WithdrawDetailsSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { user } = req.session;
  const { allianceId, targetUserId, amount, notes } = validatedBody.data;
  const canProceed = await enforceIdempotency(req, res, {
    scope: `alliance-bank-withdraw:${allianceId}:${targetUserId}:${amount.toString()}`,
    actorKey: String(user.id),
  });
  if (!canProceed) {
    return;
  }

  try {
    const result = await AllianceBankService.withdraw({
      requesterId: user.id,
      allianceId,
      targetUserId,
      amount,
      notes,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(withdrawHandler);
