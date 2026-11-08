import { AUTO_RECRUIT_ENABLED } from '@/constants/AutoRecruit';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { isSupporter } from '@/services/supporter/Entitlement.service';

/**
 * Auto-recruit is retired for everyone (AUTO_RECRUIT_ENABLED) except active
 * supporters while the supporter feature is on. The daily recruiter cap still
 * applies, so it saves clicks without raising the ceiling.
 */
export async function canAutoRecruit(userId: unknown): Promise<boolean> {
  if (AUTO_RECRUIT_ENABLED) return true;
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  if (!(await getRuntimeConfig()).enableSupporter) return false;
  return isSupporter(id);
}

export const AUTO_RECRUIT_DISABLED = {
  error: 'Auto-Recruit is currently disabled.',
  code: 'AUTO_RECRUIT_DISABLED',
} as const;
