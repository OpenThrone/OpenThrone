import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { AccountService } from '@/services';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed!' });
  }

  const EmailChangeSchema = z.object({ userEmail: z.string().email({ message: 'Invalid email format.' }) });
  const parseResult = EmailChangeSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parseResult.error.flatten().fieldErrors });
  }
  const { userEmail } = parseResult.data;

  try {
    const result = await AccountService.requestEmailChange({ email: userEmail });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}
