import { PermissionType } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';

import prisma from '@/lib/prisma';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { startNewEra } from '@/services/Era.service';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await prisma.users.findUnique({
    where: { id: session.user.id },
    include: { permissions: true },
  });

  if (
    !user ||
    !user.permissions.some((p) => p.type === PermissionType.ADMINISTRATOR)
  ) {
    return res.status(403).json({ error: 'Forbidden: Admin only' });
  }

  try {
    const newEra = await startNewEra();
    return res.status(200).json({ success: true, newEraId: newEra.id });
  } catch (error) {
    console.error('Error starting new era:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
