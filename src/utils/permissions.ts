import { PermissionType } from '@/lib/prisma-browser-exports';
import type { StaffRole } from '@/lib/prisma-exports';

const ADMINISTRATOR_ROLE: StaffRole = 'ADMINISTRATOR';
const MODERATOR_ROLE: StaffRole = 'MODERATOR';
const COMMUNITY_MANAGER_ROLE: StaffRole = 'COMMUNITY_MANAGER';
const GAME_MASTER_ROLE: StaffRole = 'GAME_MASTER';

/**
 * Role presets: each role maps to a set of capabilities.
 * ADMINISTRATOR gets everything. Other roles get subsets.
 */
const ROLE_PERMISSIONS: Record<StaffRole, PermissionType[]> = {
  [ADMINISTRATOR_ROLE]: Object.values(PermissionType),
  [MODERATOR_ROLE]: [
    PermissionType.VIEW_STAFF_DASHBOARD,
    PermissionType.VIEW_AUDIT_LOGS,
    PermissionType.MANAGE_USERS,
    PermissionType.MANAGE_ACCOUNT_STATUS,
    PermissionType.MANAGE_MODERATOR_NOTES,
    PermissionType.MANAGE_BAN_APPEALS,
    PermissionType.REVIEW_REPORTS,
    PermissionType.ASSIGN_REPORTS,
    PermissionType.MODERATE_CHAT,
    PermissionType.VIEW_CHAT_LOGS,
    PermissionType.VIEW_MULTI_ACCOUNTS,
    PermissionType.VIEW_CHEAT_SIGNALS,
  ],
  [COMMUNITY_MANAGER_ROLE]: [
    PermissionType.VIEW_STAFF_DASHBOARD,
    PermissionType.VIEW_AUDIT_LOGS,
    PermissionType.MANAGE_ANNOUNCEMENTS,
    PermissionType.MANAGE_CONTENT,
    PermissionType.SEND_MASS_MESSAGES,
    PermissionType.REVIEW_REPORTS,
    PermissionType.MODERATE_CHAT,
    PermissionType.VIEW_CHAT_LOGS,
  ],
  [GAME_MASTER_ROLE]: [
    PermissionType.VIEW_STAFF_DASHBOARD,
    PermissionType.VIEW_AUDIT_LOGS,
    PermissionType.VIEW_ECONOMY,
    PermissionType.VIEW_ANALYTICS,
    PermissionType.MANAGE_EVENTS,
    PermissionType.MANAGE_ERAS,
    PermissionType.MANAGE_ALLIANCES,
    PermissionType.MANAGE_SERVER_SETTINGS,
  ],
};

/**
 * Returns all permissions for a user based on their active staff roles
 * and any individually granted capabilities.
 */
export function expandPermissions(
  roles: StaffRole[],
  individualGrants: PermissionType[],
): PermissionType[] {
  const set = new Set<PermissionType>();

  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role];
    if (perms) {
      for (const p of perms) set.add(p);
    }
  }

  for (const p of individualGrants) {
    set.add(p);
  }

  return Array.from(set);
}

/**
 * Check if a set of permissions satisfies ALL required permissions.
 */
function hasAllPermissions(
  userPermissions: PermissionType[],
  required: PermissionType[],
): boolean {
  const userSet = new Set(userPermissions);
  return required.every((p) => userSet.has(p));
}

/**
 * Check if a set of permissions satisfies ANY of the required permissions.
 */
function hasAnyPermission(
  userPermissions: PermissionType[],
  required: PermissionType[],
): boolean {
  const userSet = new Set(userPermissions);
  return required.some((p) => userSet.has(p));
}

/**
 * Human-readable labels for StaffRoles (used in UI).
 */
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  [ADMINISTRATOR_ROLE]: 'Administrator',
  [MODERATOR_ROLE]: 'Moderator',
  [COMMUNITY_MANAGER_ROLE]: 'Community Manager',
  [GAME_MASTER_ROLE]: 'Game Master',
};

/**
 * Human-readable labels for PermissionType (used in UI).
 */
const PERMISSION_LABELS: Record<PermissionType, string> = {
  [PermissionType.VIEW_STAFF_DASHBOARD]: 'View Staff Dashboard',
  [PermissionType.VIEW_AUDIT_LOGS]: 'View Audit Logs',
  [PermissionType.MANAGE_USERS]: 'Manage Users',
  [PermissionType.MANAGE_ACCOUNT_STATUS]: 'Manage Account Status',
  [PermissionType.MANAGE_MODERATOR_NOTES]: 'Manage Moderator Notes',
  [PermissionType.MANAGE_BAN_APPEALS]: 'Manage Ban Appeals',
  [PermissionType.REVIEW_REPORTS]: 'Review Reports',
  [PermissionType.ASSIGN_REPORTS]: 'Assign Reports',
  [PermissionType.MODERATE_CHAT]: 'Moderate Chat',
  [PermissionType.VIEW_CHAT_LOGS]: 'View Chat Logs',
  [PermissionType.MANAGE_ANNOUNCEMENTS]: 'Manage Announcements',
  [PermissionType.MANAGE_CONTENT]: 'Manage Content',
  [PermissionType.SEND_MASS_MESSAGES]: 'Send Mass Messages',
  [PermissionType.MANAGE_EVENTS]: 'Manage Events',
  [PermissionType.MANAGE_ERAS]: 'Manage Eras',
  [PermissionType.MANAGE_ALLIANCES]: 'Manage Alliances',
  [PermissionType.VIEW_ECONOMY]: 'View Economy',
  [PermissionType.VIEW_ANALYTICS]: 'View Analytics',
  [PermissionType.VIEW_MULTI_ACCOUNTS]: 'View Multi-Account Data',
  [PermissionType.VIEW_CHEAT_SIGNALS]: 'View Cheat Signals',
  [PermissionType.MANAGE_FEATURE_FLAGS]: 'Manage Feature Flags',
  [PermissionType.MANAGE_SERVER_SETTINGS]: 'Manage Server Settings',
  [PermissionType.MANAGE_API_TOKENS]: 'Manage API Tokens',
  [PermissionType.USE_IMPERSONATION]: 'Use Impersonation',
};
