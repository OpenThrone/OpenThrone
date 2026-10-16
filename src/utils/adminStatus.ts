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
