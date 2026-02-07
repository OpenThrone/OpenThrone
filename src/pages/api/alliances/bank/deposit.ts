import { z } from 'zod';

import { withAuth } from '@/middleware/auth';
import { AllianceBankService } from '@/services';

const DepositDetailsSchema = z.object({
  allianceId: z.number().int().positive(),
  amount: z.coerce.bigint().min(BigInt(1), 'Amount must be positive'),
});

const depositHandler = async (req: any, res: any) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const validatedBody = DepositDetailsSchema.safeParse(req.body);
  if (!validatedBody.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: validatedBody.error.flatten().fieldErrors,
    });
  }

  const { user } = req.session;
  const { allianceId, amount } = validatedBody.data;

  try {
    const result = await AllianceBankService.deposit({
      userId: user.id,
      allianceId,
      amount,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};

export default withAuth(depositHandler);
