import { createHash } from 'crypto';
import type { NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import type { AuthenticatedRequest } from '@/types/api';

interface EnforceIdempotencyOptions {
  scope: string;
  actorKey: string;
  ttlSeconds?: number;
}

const readIdempotencyKey = (req: AuthenticatedRequest): string | null => {
  const headerValue =
    req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];

  if (Array.isArray(headerValue)) {
    return headerValue[0] ?? null;
  }
  return typeof headerValue === 'string' ? headerValue.trim() : null;
};

export const enforceIdempotency = async (
  req: AuthenticatedRequest,
  res: NextApiResponse,
  options: EnforceIdempotencyOptions,
): Promise<boolean> => {
  const { scope, actorKey, ttlSeconds = 120 } = options;
  const key = readIdempotencyKey(req);

  if (!key) {
    res.status(400).json({ error: 'Missing Idempotency-Key header' });
    return false;
  }

  const hash = createHash('sha256')
    .update(`${scope}:${actorKey}:${key}`)
    .digest('hex');

  try {
    await prisma.antiAbuseShadow.create({
      data: {
        hash,
        reason: `IDEMPOTENCY:${scope}`,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });
    return true;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      res.status(409).json({
        error: 'Duplicate request',
        message: 'This idempotency key has already been used for this action',
      });
      return false;
    }

    res.status(500).json({ error: 'Failed to validate idempotency key' });
    return false;
  }
};
