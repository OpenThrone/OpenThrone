import { Badge, UnstyledButton } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import Image from '@/components/ArtworkImage';
import classes from '@/components/navLoggedIn.module.css';
import { useLayout } from '@/context/LayoutContext';
import { useUser } from '@/context/users';
import {
  formatImpersonationTimeLeft,
  useImpersonation,
} from '@/hooks/useImpersonation';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import type { PlayerRace } from '@/types/typings';
import {
  isBattleUpgradesUnlocked,
  isStructureUpgradesUnlocked,
} from '@/utils/menuUnlocks';
import { getAssetPath } from '@/utils/utilities';

import MobileNavigation from './MobileNavigation';
import RpgAwesomeIcon from './RpgAwesomeIcon';

type NavItem = {
  key: string;
  href: string;
  labelKey: string;
  target?: string;
};

const parentLinks: NavItem[] = [
  { key: 'home', href: '/home/overview', labelKey: 'main.home' },
  { key: 'battle', href: '/battle/users', labelKey: 'main.battle' },
  {
    key: 'structures',
    href: '/structures/bank/deposit',
    labelKey: 'main.structures',
  },
  { key: 'alliances', href: '/alliances', labelKey: 'main.alliances' },
  { key: 'community', href: '/community/news', labelKey: 'main.community' },
  { key: 'about', href: '/about', labelKey: 'main.about' },
];

const subMenus: Record<string, NavItem[]> = {
  home: [
    { key: 'overview', href: '/home/overview', labelKey: 'home.overview' },
    { key: 'levels', href: '/home/levels', labelKey: 'home.levels' },
    { key: 'profile', href: '/home/profile', labelKey: 'home.profile' },
    { key: 'settings', href: '/home/settings', labelKey: 'home.settings' },
    { key: 'learn', href: '/home/learn', labelKey: 'home.learn' },
  ],
  battle: [
    { key: 'attack', href: '/battle/users', labelKey: 'battle.attack' },
    { key: 'training', href: '/battle/training', labelKey: 'battle.training' },
    {
      key: 'mercenaries',
      href: '/battle/mercenaries',
      labelKey: 'battle.mercenaries',
    },
    { key: 'upgrades', href: '/battle/upgrades', labelKey: 'battle.upgrades' },
    {
      key: 'warHistory',
      href: '/battle/history',
      labelKey: 'battle.warHistory',
    },
  ],
  structures: [
    {
      key: 'bank',
      href: '/structures/bank/deposit',
      labelKey: 'structures.bank',
    },
    {
      key: 'armory',
      href: '/structures/armory/offense',
      labelKey: 'structures.armory',
    },
    {
      key: 'upgrades',
      href: '/structures/upgrades/fortifications',
      labelKey: 'structures.upgrades',
    },
    {
      key: 'housing',
      href: '/structures/housing',
      labelKey: 'structures.housing',
    },
    {
      key: 'repair',
      href: '/structures/repair',
      labelKey: 'structures.repair',
    },
  ],
  community: [
    { key: 'news', href: '/community/news', labelKey: 'community.news' },
    {
      key: 'discord',
      href: 'https://discord.com/invite/j9NYxmBCjA',
      labelKey: 'community.discord',
    },
    { key: 'stats', href: '/community/stats', labelKey: 'community.stats' },
    {
      key: 'reportIssues',
      href: 'https://github.com/uaktags/OpenThrone/issues',
      labelKey: 'community.reportIssues',
      target: '_blank',
    },
  ],
  alliances: [
    { key: 'mine', href: '/alliances', labelKey: 'alliances.mine' },
    { key: 'browse', href: '/alliances/browse', labelKey: 'alliances.browse' },
    { key: 'create', href: '/alliances/create', labelKey: 'alliances.create' },
  ],
  about: [],
};

/** WebP heraldry crests available in public/assets/header/nav/. */
const navCrestKeys: Record<string, true> = {
  home: true,
  battle: true,
  structures: true,
  alliances: true,
  community: true,
  about: true,
  signout: true,
};

/** Leading RPG-Awesome glyph per submenu row; parent-scoped where keys collide. */
const subMenuIcons: Record<string, string> = {
  'home.overview': 'castle-flag',
  'home.levels': 'ascending-block',
  'home.profile': 'player',
  'home.settings': 'gear-hammer',
  'home.learn': 'book',
  'home.administration': 'rune-stone',
  'battle.attack': 'crossed-swords',
  'battle.training': 'muscle-up',
  'battle.upgrades': 'anvil',
  'battle.warHistory': 'scroll-unfurled',
  'structures.bank': 'banknote',
  'structures.armory': 'spiked-shield',
  'structures.upgrades': 'hammer',
  'structures.housing': 'house',
  'structures.repair': 'hammer-drop',
  'community.news': 'scroll-quill',
  'community.discord': 'speech-bubble',
  'community.stats': 'abacus',
  'community.reportIssues': 'cracked-shield',
  'alliances.mine': 'shield',
  'alliances.browse': 'double-team',
  'alliances.create': 'crown',
};

interface NavLoggedInProps {
  sidebarContent?: ReactNode;
  'data-tour-id'?: string;
}

/** Nav logged in. */
export const NavLoggedIn: React.FC<NavLoggedInProps> = ({
  sidebarContent,
  'data-tour-id': tourId,
}) => {
  const router = useRouter();
  const pathName = router.asPath?.split('?')[0] ?? '/';
  const { t: tCommon } = useTranslation('common');
  const { t: tNav } = useTranslation('navigation');
  const [activeSubMenu, setActiveSubMenu] = useState<NavItem[]>([]);
  const [activeParentKey, setActiveParentKey] = useState<string>('');
  const [activeSubKey, setActiveSubKey] = useState<string>('');

  const [defaultSubMenu, setDefaultSubMenu] = useState<NavItem[]>([]);
  const [defaultParentKey, setDefaultParentKey] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [socialNotificationCount, setSocialNotificationCount] =
    useState<number>(0);
  const { user, unreadMessagesCount } = useUser();
  const { raceClasses } = useLayout();
  const menuRace = raceClasses.race as PlayerRace;

  const hasAnyStaffAccess = user?.permissions && user.permissions.length > 0;

  const staffSubMenus = useMemo(() => {
    if (!hasAnyStaffAccess) return [];
    return [
      {
        key: 'administration',
        href: '/home/admin/overview',
        labelKey: 'home.administration',
      },
    ];
  }, [hasAnyStaffAccess]);

  // New players get a shorter menu: entries with nothing to do yet stay out
  // until their unlock rule is met (the pages themselves remain reachable).
  const progress = useMemo(
    () =>
      user
        ? {
            level: user.level,
            offensiveLevel: user.offensiveLevel,
            spyLevel: user.spyLevel,
          }
        : null,
    [user],
  );
  const lockedKeys = useMemo(() => {
    const locked = new Set<string>();
    if (!progress || !isBattleUpgradesUnlocked(progress)) {
      locked.add('battle.upgrades');
    }
    if (!progress || !isStructureUpgradesUnlocked(progress)) {
      locked.add('structures.upgrades');
    }
    return locked;
  }, [progress]);

  const resolvedSubMenus: Record<string, NavItem[]> = useMemo(() => {
    const unlocked = Object.fromEntries(
      Object.entries(subMenus).map(([parentKey, items]) => [
        parentKey,
        items.filter((item) => !lockedKeys.has(`${parentKey}.${item.key}`)),
      ]),
    );
    if (staffSubMenus.length === 0) return unlocked;
    return {
      ...unlocked,
      home: [...unlocked.home, ...staffSubMenus],
    };
  }, [lockedKeys, staffSubMenus]);

  useEffect(() => {
    const localePrefix = router.locale ? `/${router.locale}` : '';
    const normalizedPath =
      pathName.startsWith(localePrefix) && localePrefix !== '/'
        ? pathName.slice(localePrefix.length) || '/'
        : pathName;
    const segments = normalizedPath.split('/').filter(Boolean);
    let currentPath = segments[0];
    let secondPath = segments[1];
    if (normalizedPath === '/') {
      currentPath = 'home';
      secondPath = 'overview';
    }

    if (
      currentPath === 'userprofile' ||
      (currentPath === 'battle' && secondPath === 'users')
    ) {
      setActiveParentKey('battle');
      const subMenu = resolvedSubMenus.battle || [];
      setActiveSubMenu(subMenu);
      setActiveSubKey('attack');
      setDefaultParentKey('battle');
      setDefaultSubMenu(resolvedSubMenus.battle || []);
    } else if (secondPath === 'history') {
      setActiveParentKey('battle');
      const subMenu = resolvedSubMenus.battle || [];
      setActiveSubMenu(subMenu);
      setActiveSubKey('warHistory');
      setDefaultParentKey('battle');
      setDefaultSubMenu(resolvedSubMenus.battle || []);
    } else if (currentPath === 'auto-recruit') {
      setActiveParentKey('community');
      const subMenu = resolvedSubMenus.community || [];
      setActiveSubMenu(subMenu);
      setActiveSubKey('autoRecruit');
      setDefaultParentKey('community');
      setDefaultSubMenu(resolvedSubMenus.community || []);
    } else if (currentPath === 'alliances') {
      setActiveParentKey('alliances');
      const subMenu = resolvedSubMenus.alliances || [];
      setActiveSubMenu(subMenu);
      if (secondPath === 'create') setActiveSubKey('create');
      else setActiveSubKey('browse');

      setDefaultParentKey('alliances');
      setDefaultSubMenu(resolvedSubMenus.alliances || []);
    } else {
      const activeLink = parentLinks.find((link) => link.key === currentPath);
      if (activeLink) {
        setActiveParentKey(activeLink.key);
        const subMenu = resolvedSubMenus[activeLink.key] || [];
        setActiveSubMenu(subMenu);

        const activeSubLinkItem = subMenu.find(
          (item) => item.key === secondPath,
        );
        if (activeSubLinkItem) {
          setActiveSubKey(activeSubLinkItem.key);
        } else {
          setActiveSubKey('');
        }
        setDefaultParentKey(activeLink.key);
        setDefaultSubMenu(resolvedSubMenus[activeLink.key] || []);
      }
    }
  }, [pathName, router.locale, resolvedSubMenus]);

  const [resetTimer, setResetTimer] = useState<number | null>(null);

  const { config: runtimeConfig } = useRuntimeConfig();
  const socialEnabled = runtimeConfig?.enableSocial === true;

  const fetchSocialNotifications = useCallback(async () => {
    // Social endpoints answer 503 while the feature is off; don't poll them.
    if (!user || !socialEnabled) return;
    try {
      const response = await fetch('/api/social/notifications/count');
      if (!response.ok) return;
      const data = await response.json();
      setSocialNotificationCount(Number(data.count) || 0);
    } catch {
      // keep existing count on failure
    }
  }, [user, socialEnabled]);

  useEffect(() => {
    fetchSocialNotifications();
    const focusHandler = () => fetchSocialNotifications();
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        fetchSocialNotifications();
      }
    };
    const intervalId = window.setInterval(
      fetchSocialNotifications,
      2 * 60 * 1000,
    );
    window.addEventListener('focus', focusHandler);
    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      window.removeEventListener('focus', focusHandler);
      document.removeEventListener('visibilitychange', visibilityHandler);
      window.clearInterval(intervalId);
    };
  }, [fetchSocialNotifications]);

  const handleQuickAction = useCallback(
    (target: string) => () => {
      setMobileMenuOpen(false);
      router.push(target);
    },
    [router],
  );

  const resetMenu = () => {
    const timer = window.setTimeout(() => {
      setActiveParentKey(defaultParentKey);
      setActiveSubMenu(defaultSubMenu);
    }, 300);
    setResetTimer(timer);
  };

  // Remember to clear the timeout when the mouse enters again to prevent it from resetting while still hovering
  const clearReset = () => {
    if (resetTimer) {
      window.clearTimeout(resetTimer);
      setResetTimer(null);
    }
  };
  const allMenuItems: {
    key: string;
    label: string;
    href?: string;
    onClick?: () => void;
    icon?: ReactNode;
    children?: {
      key: string;
      label: string;
      href?: string;
      onClick?: () => void;
      icon?: ReactNode;
    }[];
  }[] = parentLinks.map((parent) => {
    const children = resolvedSubMenus[parent.key]?.map((item) => {
      const subIcon = subMenuIcons[`${parent.key}.${item.key}`];
      return {
        key: item.key,
        label: tNav(item.labelKey),
        href: item.href,
        icon: subIcon ? <RpgAwesomeIcon icon={subIcon} fw /> : undefined,
      };
    });
    return {
      key: parent.key,
      label: tNav(parent.labelKey),
      icon: navCrestKeys[parent.key] ? (
        <Image
          src={`/assets/header/nav/${parent.key}.webp`}
          alt=""
          width={24}
          height={24}
        />
      ) : undefined,
      children,
    };
  });

  allMenuItems.push({
    key: 'signout',
    label: tNav('actions.signOut'),
    onClick: () => signOut({ callbackUrl: '/' }),
    icon: (
      <Image
        src="/assets/header/nav/signout.webp"
        alt=""
        width={24}
        height={24}
      />
    ),
  });

  const notificationSum = unreadMessagesCount + socialNotificationCount;
  const badgeLabel = notificationSum > 9 ? '9+' : `${notificationSum}`;
  const {
    isImpersonating,
    msLeft: impersonationMsLeft,
    end: handleStopImpersonation,
  } = useImpersonation();
  const endImpersonationLabel = tNav('actions.endImpersonation', {
    time: formatImpersonationTimeLeft(impersonationMsLeft ?? 0),
  });

  if (isImpersonating) {
    allMenuItems.push({
      key: 'endImpersonation',
      label: endImpersonationLabel,
      onClick: handleStopImpersonation,
    });
  }

  return (
    <>
      <div
        className={`flex justify-end py-0 pr-1 xl:hidden ${raceClasses.menuPrimaryClass}`}
        style={{
          backgroundImage: `url('${getAssetPath('top-menu', null, menuRace)}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="relative">
          <UnstyledButton
            type="button"
            className={`min-h-[48px] min-w-[48px] rounded-md p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-400 ${
              mobileMenuOpen
                ? 'bg-white/10 text-orange-300'
                : 'text-white hover:text-gray-200'
            }`}
            onClick={() => setMobileMenuOpen(true)}
            aria-label={tNav('ariaLabels.mobileMenuButton')}
            aria-expanded={mobileMenuOpen}
            data-testid="mobile-menu-button"
          >
            <svg
              className={`size-6 transition-transform ${
                mobileMenuOpen ? 'rotate-90' : ''
              }`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </UnstyledButton>
          {notificationSum > 0 && (
            <Badge
              color="red"
              variant="filled"
              size="xs"
              className="absolute -right-1 -top-1"
              aria-label={tCommon('ariaLabels.unreadNotifications', {
                count: notificationSum,
              })}
            >
              {badgeLabel}
            </Badge>
          )}
        </div>
      </div>
      <MobileNavigation
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        menuItems={allMenuItems}
        quickActions={{
          unreadMessagesCount,
          socialNotificationCount,
          onMessagesClick: handleQuickAction('/messaging'),
          onSocialClick: handleQuickAction('/social/requests'),
          onSettingsClick: handleQuickAction('/home/settings'),
        }}
        sidebarContent={sidebarContent}
        className="xl:hidden"
      />
      <div
        onMouseLeave={resetMenu}
        onMouseEnter={clearReset}
        data-tour-id={tourId}
      >
        <nav
          className={`hidden h-10 xl:block ${raceClasses.menuPrimaryClass} ${classes.primary}`}
          style={{
            backgroundImage: `url('${getAssetPath('top-menu', null, menuRace)}')`,
          }}
          aria-label={tNav('ariaLabels.mainNavigation')}
          onMouseEnter={clearReset}
        >
          <ul className={classes.primaryList}>
            {parentLinks.map((link) => (
              <li key={link.key}>
                <Link
                  href={link.href}
                  className={classes.navLink}
                  data-active={activeParentKey === link.key || undefined}
                  aria-current={
                    defaultParentKey === link.key ? 'page' : undefined
                  }
                  onMouseOver={() =>
                    setActiveSubMenu(resolvedSubMenus[link.key] || [])
                  }
                  onFocus={() =>
                    setActiveSubMenu(resolvedSubMenus[link.key] || [])
                  }
                  onClick={() =>
                    setActiveSubMenu(resolvedSubMenus[link.key] || [])
                  }
                  data-testid={`nav-${link.key}-link`}
                >
                  <Image
                    src={`/assets/header/nav/${link.key}.webp`}
                    alt=""
                    width={24}
                    height={24}
                    className={classes.icon}
                  />
                  <span>{tNav(link.labelKey)}</span>
                </Link>
              </li>
            ))}
            <li>
              <UnstyledButton
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className={classes.navLink}
                data-testid="desktop-sign-out-button"
              >
                <Image
                  src="/assets/header/nav/signout.webp"
                  alt=""
                  width={24}
                  height={24}
                  className={classes.icon}
                />
                <span>{tNav('actions.signOut')}</span>
              </UnstyledButton>
            </li>
            {isImpersonating && (
              <li>
                <UnstyledButton
                  type="button"
                  onClick={handleStopImpersonation}
                  className={classes.navLink}
                  data-testid="desktop-end-impersonation-button"
                  title={endImpersonationLabel}
                  aria-label={endImpersonationLabel}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {tNav('actions.endImpersonationShort', {
                    time: formatImpersonationTimeLeft(impersonationMsLeft ?? 0),
                  })}
                </UnstyledButton>
              </li>
            )}
          </ul>
        </nav>
        <nav
          className={`hidden h-10 xl:block ${raceClasses.menuSecondaryClass} ${classes.secondary}`}
          style={{
            backgroundImage: `url('${getAssetPath('bottom-menu', null, menuRace)}')`,
          }}
          onMouseEnter={clearReset}
          aria-label={tNav('ariaLabels.subNavigation')}
        >
          <ul className={classes.secondaryList}>
            {activeSubMenu.map((item) => (
              <li key={`${item.key}.${item.href}`}>
                <Link
                  href={item.href}
                  className={classes.subLink}
                  data-active={
                    (defaultSubMenu === activeSubMenu &&
                      activeSubKey === item.key) ||
                    undefined
                  }
                  aria-current={
                    defaultSubMenu === activeSubMenu &&
                    activeSubKey === item.key
                      ? 'page'
                      : undefined
                  }
                  target={item.target ?? '_self'}
                  rel={
                    item.target === '_blank' ? 'noopener noreferrer' : undefined
                  }
                  data-testid="nav-link"
                >
                  {tNav(item.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
};
