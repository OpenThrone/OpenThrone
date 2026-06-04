import { PermissionType } from '@prisma/client';

export interface AdminNavItem {
  key: string;
  labelKey: string;
  href: string;
  permissions?: PermissionType[];
}

export interface AdminNavCategory {
  key: string;
  labelKey: string;
  items: AdminNavItem[];
}

/**
 * Admin navigation structure, organized by category.
 * Each item declares the permission(s) required to see it.
 * The sidebar filters items based on the current user's permissions.
 */
export const adminNavCategories: AdminNavCategory[] = [
  {
    key: 'overview',
    labelKey: 'navigation.adminCategories.overview',
    items: [
      {
        key: 'dashboard',
        labelKey: 'navigation.home.administration',
        href: '/home/admin/overview',
        permissions: [PermissionType.VIEW_STAFF_DASHBOARD],
      },
    ],
  },
  {
    key: 'users',
    labelKey: 'navigation.adminCategories.users',
    items: [
      {
        key: 'user-management',
        labelKey: 'navigation.home.staffUsers',
        href: '/home/admin',
        permissions: [PermissionType.MANAGE_USERS],
      },
    ],
  },
  {
    key: 'moderation',
    labelKey: 'navigation.adminCategories.moderation',
    items: [
      {
        key: 'reports',
        labelKey: 'navigation.home.staffReports',
        href: '/home/moderation/reports',
        permissions: [PermissionType.REVIEW_REPORTS],
      },
      {
        key: 'bans',
        labelKey: 'navigation.home.staffBans',
        href: '/home/moderation/bans',
        permissions: [PermissionType.MANAGE_ACCOUNT_STATUS],
      },
      {
        key: 'chat',
        labelKey: 'navigation.home.staffChat',
        href: '/home/moderation/chat',
        permissions: [PermissionType.MODERATE_CHAT],
      },
      {
        key: 'appeals',
        labelKey: 'navigation.home.staffAppeals',
        href: '/home/moderation/appeals',
        permissions: [PermissionType.MANAGE_BAN_APPEALS],
      },
      {
        key: 'multi-accounts',
        labelKey: 'navigation.home.staffMultiAccounts',
        href: '/home/admin/multi-accounts',
        permissions: [PermissionType.VIEW_MULTI_ACCOUNTS],
      },
      {
        key: 'cheat-signals',
        labelKey: 'navigation.home.staffCheatSignals',
        href: '/home/admin/cheat-signals',
        permissions: [PermissionType.VIEW_CHEAT_SIGNALS],
      },
    ],
  },
  {
    key: 'game',
    labelKey: 'navigation.adminCategories.gameManagement',
    items: [
      {
        key: 'events',
        labelKey: 'navigation.home.staffEvents',
        href: '/home/admin/events',
        permissions: [PermissionType.MANAGE_EVENTS],
      },
      {
        key: 'eras',
        labelKey: 'navigation.home.staffEras',
        href: '/home/admin/eras',
        permissions: [PermissionType.MANAGE_ERAS],
      },
      {
        key: 'alliances',
        labelKey: 'navigation.home.staffAlliances',
        href: '/home/admin/alliances',
        permissions: [PermissionType.MANAGE_ALLIANCES],
      },
      {
        key: 'balance-sim',
        labelKey: 'navigation.home.balanceSim',
        href: '/home/admin/balance-sim',
        permissions: [
          PermissionType.MANAGE_EVENTS,
          PermissionType.VIEW_STAFF_DASHBOARD,
        ],
      },
    ],
  },
  {
    key: 'content',
    labelKey: 'navigation.adminCategories.content',
    items: [
      {
        key: 'content',
        labelKey: 'navigation.home.staffContent',
        href: '/home/admin/content',
        permissions: [PermissionType.MANAGE_CONTENT],
      },
      {
        key: 'announcements',
        labelKey: 'navigation.home.staffAnnouncements',
        href: '/home/admin/announcements',
        permissions: [PermissionType.MANAGE_ANNOUNCEMENTS],
      },
      {
        key: 'mass-messaging',
        labelKey: 'navigation.home.staffMassMessaging',
        href: '/home/admin/mass-messaging',
        permissions: [PermissionType.SEND_MASS_MESSAGES],
      },
    ],
  },
  {
    key: 'analytics',
    labelKey: 'navigation.adminCategories.analytics',
    items: [
      {
        key: 'economy',
        labelKey: 'navigation.home.staffEconomy',
        href: '/home/admin/economy',
        permissions: [PermissionType.VIEW_ECONOMY],
      },
      {
        key: 'analytics',
        labelKey: 'navigation.home.staffAnalytics',
        href: '/home/admin/analytics',
        permissions: [PermissionType.VIEW_ANALYTICS],
      },
    ],
  },
  {
    key: 'system',
    labelKey: 'navigation.adminCategories.system',
    items: [
      {
        key: 'settings',
        labelKey: 'navigation.home.staffSettings',
        href: '/home/admin/settings',
        permissions: [PermissionType.MANAGE_SERVER_SETTINGS],
      },
      {
        key: 'feature-flags',
        labelKey: 'navigation.home.staffFeatureFlags',
        href: '/home/admin/feature-flags',
        permissions: [PermissionType.MANAGE_FEATURE_FLAGS],
      },
      {
        key: 'api-tokens',
        labelKey: 'navigation.home.staffApiTokens',
        href: '/home/admin/api-tokens',
        permissions: [PermissionType.MANAGE_API_TOKENS],
      },
      {
        key: 'maintenance',
        labelKey: 'navigation.home.staffMaintenance',
        href: '/home/admin/maintenance',
        permissions: [PermissionType.MANAGE_SERVER_SETTINGS],
      },
    ],
  },
  {
    key: 'audit',
    labelKey: 'navigation.adminCategories.audit',
    items: [
      {
        key: 'audit-logs',
        labelKey: 'navigation.home.staffAudit',
        href: '/home/admin/audit-logs',
        permissions: [PermissionType.VIEW_AUDIT_LOGS],
      },
    ],
  },
];
