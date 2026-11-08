import type { NextApiResponse } from 'next';

import { PermissionType } from '@/lib/prisma-exports';
import { AdminForceError } from '@/services/AdminForces.service';
import type { AuthenticatedRequest } from '@/types/api';
import { getRequestIp } from '@/utils/auditLogger';
import { logError } from '@/utils/logger';

/** Force tooling touches both player armies and alliance reserves. */
export const FORCE_ADMIN_PERMISSIONS = [
  PermissionType.MANAGE_USERS,
  PermissionType.MANAGE_ALLIANCES,
];

export function adminActor(req: AuthenticatedRequest) {
  return { userId: Number(req.session?.user?.id), ip: getRequestIp(req) };
}

export function sendForceError(
  res: NextApiResponse,
  err: unknown,
  label: string,
) {
  if (err instanceof AdminForceError)
    return res.status(err.status).json({ error: err.message });
  logError(label, err);
  return res.status(500).json({ error: 'Action failed' });
}
