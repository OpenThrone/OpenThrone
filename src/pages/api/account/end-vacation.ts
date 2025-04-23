// src/pages/api/end-vacation.ts
import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logError } from '@/utils/logger';

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
    await prisma.$transaction(async (tx) => {
      // End the current 'VACATION' status
      await tx.accountStatusHistory.updateMany({
        where: {
          user_id: userId,
          status: 'VACATION',
          end_date: null, // Ensure we're only updating the active vacation status
        },
        data: {
          end_date: new Date(), // Set the end_date to now
        },
      });

      // Create a new 'ACTIVE' status entry
      await tx.accountStatusHistory.create({
        data: {
          user_id: userId,
          status: 'ACTIVE',
          start_date: new Date(),
          reason: 'Vacation mode ended by user',
        },
      });
    });

    res.status(200).json({ message: 'Vacation mode ended' });
  } catch (error) {
    logError(error)
    res.status(500).json({ error: 'Failed to end vacation mode' });
  }
}
