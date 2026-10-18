/**
 * Alliance rank permissions. Client-safe: shared by the services, the API
 * routes and the Ranks UI. The alliance leader always holds every permission.
 */
export const ALLIANCE_PERMISSION_KEYS = [
  'invite_member',
  'grant_access',
  'edit_ranks',
  'kick_member',
  'declare_war',
  'manage_bank',
  'request_gold',
  'send_messages',
  'post_announcements',
  'edit_profile',
  'manage_allies',
  'manage_enemies',
  'edit_list',
  'view_list',
  'share_reports',
  'call_targets',
] as const;

export type AlliancePermissionKey = (typeof ALLIANCE_PERMISSION_KEYS)[number];

export type AlliancePermissions = Partial<
  Record<AlliancePermissionKey, boolean>
>;

/** i18n keys (alliances namespace) and English fallbacks for each permission. */
export const ALLIANCE_PERMISSION_LABELS: Record<
  AlliancePermissionKey,
  { key: string; fallback: string }
> = {
  invite_member: {
    key: 'ranks.perm.invite_member',
    fallback: 'Accept members',
  },
  grant_access: { key: 'ranks.perm.grant_access', fallback: 'Assign ranks' },
  edit_ranks: { key: 'ranks.perm.edit_ranks', fallback: 'Edit ranks' },
  kick_member: { key: 'ranks.perm.kick_member', fallback: 'Kick members' },
  declare_war: { key: 'ranks.perm.declare_war', fallback: 'Declare war' },
  manage_bank: { key: 'ranks.perm.manage_bank', fallback: 'Manage bank' },
  request_gold: {
    key: 'ranks.perm.request_gold',
    fallback: 'Request gold from the treasury',
  },
  send_messages: {
    key: 'ranks.perm.send_messages',
    fallback: 'Send messages',
  },
  post_announcements: {
    key: 'ranks.perm.post_announcements',
    fallback: 'Post announcements',
  },
  edit_profile: { key: 'ranks.perm.edit_profile', fallback: 'Edit profile' },
  manage_allies: {
    key: 'ranks.perm.manage_allies',
    fallback: 'Manage allies',
  },
  manage_enemies: {
    key: 'ranks.perm.manage_enemies',
    fallback: 'Manage enemies',
  },
  edit_list: { key: 'ranks.perm.edit_list', fallback: 'Edit list' },
  view_list: { key: 'ranks.perm.view_list', fallback: 'View list' },
  share_reports: {
    key: 'ranks.perm.share_reports',
    fallback: 'Share reports with the alliance',
  },
  call_targets: {
    key: 'ranks.perm.call_targets',
    fallback: 'Call hit, farm and recon targets',
  },
};

/** Name of the role every new member receives; it cannot be renamed or deleted. */
export const DEFAULT_ALLIANCE_ROLE_NAME = 'Member';

/** A permissions object with every key set to false. */
export const emptyAlliancePermissions = (): Record<
  AlliancePermissionKey,
  boolean
> =>
  Object.fromEntries(
    ALLIANCE_PERMISSION_KEYS.map((key) => [key, false]),
  ) as Record<AlliancePermissionKey, boolean>;

/**
 * Whether a user holds a permission. The leader always does; anyone else
 * needs a membership role whose permissions JSON sets the key to true.
 */
export const hasAlliancePermission = (
  leaderId: number | null | undefined,
  userId: number | null | undefined,
  role: { permissions?: unknown } | null | undefined,
  key: AlliancePermissionKey,
): boolean => {
  if (userId == null) return false;
  if (leaderId != null && leaderId === userId) return true;
  const permissions = role?.permissions;
  if (!permissions || typeof permissions !== 'object') return false;
  return (permissions as Record<string, unknown>)[key] === true;
};

/**
 * Whether the actor outranks a role. Lower rank_order is a higher rank; the
 * leader outranks every role. Equal ranks do not outrank each other.
 */
export const outranksRole = (
  actorIsLeader: boolean,
  actorRankOrder: number | null | undefined,
  targetRankOrder: number | null | undefined,
): boolean => {
  if (actorIsLeader) return true;
  if (actorRankOrder == null || targetRankOrder == null) return false;
  return targetRankOrder > actorRankOrder;
};
