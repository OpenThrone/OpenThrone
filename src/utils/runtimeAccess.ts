import prisma from '@/lib/prisma';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';

/** Recovery and public configuration remain reachable during planned downtime. */
export async function getMaintenanceBlock(
  url: string | undefined,
  userId?: number,
  impersonated = false,
): Promise<string | null> {
  const path = (url ?? '').split('?')[0];
  if (
    path === '/api/config' ||
    path === '/api/era-reset-schedule' ||
    path.startsWith('/api/auth/') ||
    path === '/api/appeals' ||
    path.startsWith('/api/account/password') ||
    path.startsWith('/api/account/2fa')
  )
    return null;
  const config = await getRuntimeConfig();
  if (!config.maintenance.enabled && !config.eraResetInProgress) return null;
  if (userId && !impersonated) {
    const staff = await prisma.staffRoleAssignment.findFirst({
      where: {
        userId,
        revokedAt: null,
        role: { in: ['ADMINISTRATOR', 'MODERATOR'] },
      },
      select: { id: true },
    });
    if (staff) return null;
  }
  if (config.eraResetInProgress)
    return 'The Era is resetting. Please try again shortly.';
  return (
    config.maintenance.message || 'The realm is temporarily under maintenance.'
  );
}

/** Apply feature switches to the server routes that mutate social relationships. */
export async function getRuntimeFeatureBlock(
  url: string | undefined,
  body: unknown,
): Promise<string | null> {
  const path = (url ?? '').split('?')[0];
  if (!path.startsWith('/api/social/')) return null;
  const config = await getRuntimeConfig();
  if (!config.enableSocial) return 'Social features are currently disabled.';
  if (
    !config.enableEnemies &&
    body &&
    typeof body === 'object' &&
    (body as { relationshipType?: unknown }).relationshipType === 'ENEMY'
  )
    return 'Enemy relationships are currently disabled.';
  return null;
}
