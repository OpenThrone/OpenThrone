import { GeneralService } from '@/services/General.service';

import { getIpAddress } from './ipUtils';

export async function logAction(
  userId: number,
  action: string,
  ip: string,
  details: any = {},
) {
  await GeneralService.logAuditAction(userId, action, ip, details);
}

export function getRequestIp(req: any) {
  return getIpAddress(req);
}
