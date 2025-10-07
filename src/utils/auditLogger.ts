import prisma from '@/lib/prisma';
import { getIpAddress } from './ipUtils';

export async function logAction(userId: number, action: string, ip: string, details: any = {}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        ip,
        details,
      },
    });
  } catch (error) {
    console.error('Failed to log audit action:', error);
  }
}

// Helper to get IP from request
export function getRequestIp(req: any) {
  return getIpAddress(req);
}