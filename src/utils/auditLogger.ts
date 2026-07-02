import { GeneralService } from '@/services/General.service';

import { getIpAddress } from './ipUtils';

/** Writes an auditable staff or system action with request context. */
export async function logAction(
  userId: number,
  action: string,
  ip: string,
  details: any = {},
) {
  await GeneralService.logAuditAction(userId, action, ip, details);
}

/** Returns request ip for callers that need normalized game data. */
export function getRequestIp(req: any) {
  return getIpAddress(req);
}
