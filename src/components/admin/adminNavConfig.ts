import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBan,
  faBullhorn,
  faCalendarDays,
  faChartLine,
  faChessRook,
  faClipboardList,
  faClone,
  faCoins,
  faCommentDots,
  faComments,
  faEnvelopesBulk,
  faFeatherPointed,
  faFileLines,
  faFlag,
  faFlask,
  faGaugeHigh,
  faGear,
  faHandshake,
  faHourglassHalf,
  faKey,
  faRobot,
  faScaleBalanced,
  faScrewdriverWrench,
  faShieldHalved,
  faUserClock,
  faUsers,
  faUserSecret,
} from '@fortawesome/free-solid-svg-icons';

import { PermissionType } from '@/lib/prisma-browser-exports';

/** Describes the admin nav item data contract. */
export interface AdminNavItem {
  key: string;
  icon: IconDefinition;
  labelKey: string;
  href: string;
  permissions?: PermissionType[];
  administratorOnly?: boolean;
}

/** Describes the admin nav category data contract. */
export interface AdminNavCategory {
  key: string;
  icon: IconDefinition;
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
    icon: faGaugeHigh,
    labelKey: 'navigation.adminCategories.overview',
    items: [
      {
        key: 'dashboard',
        icon: faGaugeHigh,
        labelKey: 'navigation.home.administration',
        href: '/home/admin/overview',
        permissions: [PermissionType.VIEW_STAFF_DASHBOARD],
      },
    ],
  },
  {
    key: 'users',
    icon: faUsers,
    labelKey: 'navigation.adminCategories.users',
    items: [
      {
        key: 'user-management',
        icon: faUsers,
        labelKey: 'navigation.home.staffUsers',
        href: '/home/admin',
        permissions: [PermissionType.MANAGE_USERS],
      },
      {
        key: 'inactive-users',
        icon: faUserClock,
        labelKey: 'navigation.home.staffInactiveUsers',
        href: '/home/admin/inactive-users',
        permissions: [PermissionType.MANAGE_USERS],
      },
    ],
  },
  {
    key: 'moderation',
    icon: faShieldHalved,
    labelKey: 'navigation.adminCategories.moderation',
    items: [
      {
        key: 'reports',
        icon: faFlag,
        labelKey: 'navigation.home.staffReports',
        href: '/home/moderation/reports',
        permissions: [PermissionType.REVIEW_REPORTS],
      },
      {
        key: 'bans',
        icon: faBan,
        labelKey: 'navigation.home.staffBans',
        href: '/home/moderation/bans',
        permissions: [PermissionType.MANAGE_ACCOUNT_STATUS],
      },
      {
        key: 'chat',
        icon: faComments,
        labelKey: 'navigation.home.staffChat',
        href: '/home/moderation/chat',
        permissions: [PermissionType.MODERATE_CHAT],
      },
      {
        key: 'appeals',
        icon: faScaleBalanced,
        labelKey: 'navigation.home.staffAppeals',
        href: '/home/moderation/appeals',
        permissions: [PermissionType.MANAGE_BAN_APPEALS],
      },
      {
        key: 'multi-accounts',
        icon: faClone,
        labelKey: 'navigation.home.staffMultiAccounts',
        href: '/home/admin/multi-accounts',
        permissions: [PermissionType.VIEW_MULTI_ACCOUNTS],
      },
      {
        key: 'cheat-signals',
        icon: faUserSecret,
        labelKey: 'navigation.home.staffCheatSignals',
        href: '/home/admin/cheat-signals',
        permissions: [PermissionType.VIEW_CHEAT_SIGNALS],
      },
    ],
  },
  {
    key: 'game',
    icon: faChessRook,
    labelKey: 'navigation.adminCategories.gameManagement',
    items: [
      {
        key: 'events',
        icon: faCalendarDays,
        labelKey: 'navigation.home.staffEvents',
        href: '/home/admin/events',
        permissions: [PermissionType.MANAGE_EVENTS],
      },
      {
        key: 'eras',
        icon: faHourglassHalf,
        labelKey: 'navigation.home.staffEras',
        href: '/home/admin/eras',
        permissions: [PermissionType.MANAGE_ERAS],
      },
      {
        key: 'alliances',
        icon: faHandshake,
        labelKey: 'navigation.home.staffAlliances',
        href: '/home/admin/alliances',
        permissions: [PermissionType.MANAGE_ALLIANCES],
      },
      {
        key: 'balance-sim',
        icon: faFlask,
        labelKey: 'navigation.home.balanceSim',
        href: '/home/admin/balance-sim',
        administratorOnly: true,
        permissions: [
          PermissionType.MANAGE_EVENTS,
          PermissionType.VIEW_STAFF_DASHBOARD,
        ],
      },
      {
        key: 'bots',
        icon: faRobot,
        labelKey: 'navigation.home.staffBots',
        href: '/home/admin/bots',
        administratorOnly: true,
      },
    ],
  },
  {
    key: 'content',
    icon: faFeatherPointed,
    labelKey: 'navigation.adminCategories.content',
    items: [
      {
        key: 'content',
        icon: faFileLines,
        labelKey: 'navigation.home.staffContent',
        href: '/home/admin/content',
        permissions: [PermissionType.MANAGE_CONTENT],
      },
      {
        key: 'announcements',
        icon: faBullhorn,
        labelKey: 'navigation.home.staffAnnouncements',
        href: '/home/admin/announcements',
        permissions: [PermissionType.MANAGE_ANNOUNCEMENTS],
      },
      {
        key: 'mass-messaging',
        icon: faEnvelopesBulk,
        labelKey: 'navigation.home.staffMassMessaging',
        href: '/home/admin/mass-messaging',
        permissions: [PermissionType.SEND_MASS_MESSAGES],
      },
      {
        key: 'advisor-messages',
        icon: faCommentDots,
        labelKey: 'navigation.home.staffAdvisorMessages',
        href: '/home/admin/advisor-messages',
        permissions: [PermissionType.MANAGE_CONTENT],
      },
    ],
  },
  {
    key: 'analytics',
    icon: faChartLine,
    labelKey: 'navigation.adminCategories.analytics',
    items: [
      {
        key: 'attack-ledger',
        icon: faClipboardList,
        labelKey: 'navigation.home.staffAttackLedger',
        href: '/home/admin/attacks',
        permissions: [PermissionType.VIEW_ANALYTICS],
      },
      {
        key: 'economy',
        icon: faCoins,
        labelKey: 'navigation.home.staffEconomy',
        href: '/home/admin/economy',
        permissions: [PermissionType.VIEW_ECONOMY],
      },
      {
        key: 'analytics',
        icon: faChartLine,
        labelKey: 'navigation.home.staffAnalytics',
        href: '/home/admin/analytics',
        permissions: [PermissionType.VIEW_ANALYTICS],
      },
    ],
  },
  {
    key: 'system',
    icon: faGear,
    labelKey: 'navigation.adminCategories.system',
    items: [
      {
        key: 'settings',
        icon: faGear,
        labelKey: 'navigation.home.staffSettings',
        href: '/home/admin/settings',
        permissions: [PermissionType.MANAGE_SERVER_SETTINGS],
      },
      {
        key: 'api-tokens',
        icon: faKey,
        labelKey: 'navigation.home.staffApiTokens',
        href: '/home/admin/api-tokens',
        permissions: [PermissionType.MANAGE_API_TOKENS],
      },
      {
        key: 'maintenance',
        icon: faScrewdriverWrench,
        labelKey: 'navigation.home.staffMaintenance',
        href: '/home/admin/maintenance',
        permissions: [PermissionType.MANAGE_SERVER_SETTINGS],
      },
    ],
  },
  {
    key: 'audit',
    icon: faClipboardList,
    labelKey: 'navigation.adminCategories.audit',
    items: [
      {
        key: 'audit-logs',
        icon: faClipboardList,
        labelKey: 'navigation.home.staffAudit',
        href: '/home/admin/audit-logs',
        permissions: [PermissionType.VIEW_AUDIT_LOGS],
      },
    ],
  },
];
