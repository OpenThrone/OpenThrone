// src/pages/api/end-vacation.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { logError } from '@/utils/logger';
import { AccountService } from '@/services';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const EndVacationSchema = z.object({ userId: z.number().int() });
  const parseResult = EndVacationSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid or missing userId', details: parseResult.error.flatten().fieldErrors });
  }
  const { userId } = parseResult.data;

  try {
    const result = await AccountService.endVacation(userId);
    res.status(200).json(result);
  } catch (error) {
    logError(error)
    res.status(500).json({ error: 'Failed to end vacation mode' });
  }
}
