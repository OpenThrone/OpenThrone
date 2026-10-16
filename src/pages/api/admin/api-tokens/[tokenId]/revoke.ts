import type { NextApiResponse } from 'next';
import { z } from 'zod';

import { withApiGuard } from '@/middleware/apiGuard';
import { ApiTokenService } from '@/services/ApiToken.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp, logAction } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

const RevokeQuerySchema = z.object({
  tokenId: z.coerce.number().int().positive(),
});

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'admin',
  rateLimitProfile: 'admin',
  querySchema: RevokeQuerySchema,
});

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: { query: z.infer<typeof RevokeQuerySchema> },
) {
  try {
    await ApiTokenService.revokeToken(context.query.tokenId);
    // Revocation only reduces access, so the audit write is best effort.
    await logAction(
      Number(req.session?.user?.id),
      'ADMIN_API_TOKEN_REVOKE',
      getRequestIp(req),
      { tokenId: context.query.tokenId },
    );
    return res.status(200).json({ message: 'Token revoked' });
  } catch (error) {
    logError('Failed revoking API token', { error });
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export default guardedHandler(handler);
