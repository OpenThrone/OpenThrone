import { idleThresholdDate } from '@/utils/utilities';

const HARD_BLOCKED_STATUSES = new Set([
  'BANNED',
  'SUSPENDED',
  'CLOSED',
  'VACATION',
  'TIMEOUT',
  'RESET',
  'INACTIVE',
]);

/**
 * The status in effect at `now`: that of the latest entry already started,
 * unless its end date has passed. Mirrors the login/session policy, so timed
 * bans and suspensions count until they expire. `entries` must be newest first.
 */
export const currentStatus = (
  entries:
    | readonly { status: string; start_date: Date; end_date: Date | null }[]
    | undefined,
  now: Date = new Date(),
): string | undefined => {
  const latest = entries?.find((entry) => entry.start_date <= now);
  if (!latest) return undefined;
  return latest.end_date && latest.end_date <= now ? undefined : latest.status;
};

/** Derive admin user status. */
export const deriveAdminUserStatus = ({
  latestStatus,
  lastActive,
  currentEraId,
  activeEraId,
}: {
  latestStatus?: string | null;
  lastActive?: Date | null;
  currentEraId?: number | null;
  activeEraId?: number | null;
}) => {
  if (latestStatus && HARD_BLOCKED_STATUSES.has(latestStatus)) {
    return latestStatus;
  }

  if (!activeEraId || !currentEraId || currentEraId !== activeEraId) {
    return 'INACTIVE';
  }

  if (!lastActive) {
    return 'IDLE';
  }

  if (lastActive < idleThresholdDate(60)) {
    return 'IDLE';
  }

  return 'ACTIVE';
};
