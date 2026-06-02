/* eslint-disable jsx-a11y/anchor-is-valid */
import { Badge, Indicator } from '@mantine/core';
import { PermissionType } from '@prisma/client';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut, useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useLayout } from '@/context/LayoutContext';
import { useUser } from '@/context/users';
import type { PlayerRace } from '@/types/typings';
import { getAssetPath } from '@/utils/utilities';

import MobileNavigation from './MobileNavigation';

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
  { key: 'alliances', href: '/alliances/browse', labelKey: 'main.alliances' },
  { key: 'community', href: '/community/news', labelKey: 'main.community' },
  { key: 'about', href: '/about', labelKey: 'main.about' },
];

const subMenus: Record<string, NavItem[]> = {
  home: [
    { key: 'overview', href: '/home/overview', labelKey: 'home.overview' },
    { key: 'levels', href: '/home/levels', labelKey: 'home.levels' },
    { key: 'profile', href: '/home/profile', labelKey: 'home.profile' },
    { key: 'settings', href: '/home/settings', labelKey: 'home.settings' },
  ],
  battle: [
    { key: 'attack', href: '/battle/users', labelKey: 'battle.attack' },
    { key: 'training', href: '/battle/training', labelKey: 'battle.training' },
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
      href: 'https://discord.gg/j9NYxmBCjA',
      labelKey: 'community.discord',
    },
    {
      key: 'autoRecruit',
      href: '/auto-recruit',
      labelKey: 'community.autoRecruit',
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
    { key: 'browse', href: '/alliances/browse', labelKey: 'alliances.browse' },
    { key: 'create', href: '/alliances/create', labelKey: 'alliances.create' },
  ],
  about: [],
};

interface NavLoggedInProps {
  sidebarContent?: ReactNode;
}

export const NavLoggedIn: React.FC<NavLoggedInProps> = ({ sidebarContent }) => {
  const router = useRouter();
  const pathName = router.asPath?.split('?')[0] ?? '/';
  const { t: tCommon } = useTranslation('common');
  const { t: tNav } = useTranslation('navigation');
  const { data: session } = useSession();
  const [activeSubMenu, setActiveSubMenu] = useState<NavItem[]>([]);
  const [activeParentKey, setActiveParentKey] = useState<string>('');
  const [activeSubKey, setActiveSubKey] = useState<string>('');

  const [defaultSubMenu, setDefaultSubMenu] = useState<NavItem[]>([]);
  const [defaultParentKey, setDefaultParentKey] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [socialNotificationCount, setSocialNotificationCount] =
    useState<number>(0);
  const layoutCont = useLayout();
  const { user, unreadMessagesCount } = useUser();

  // Add the administration link only if the user has admin privileges
  if (
    user?.permissions?.some(
      (perm) => perm.type === PermissionType.ADMINISTRATOR,
    ) &&
    !subMenus.home.some((subNav) => subNav.key === 'administration')
  ) {
    subMenus.home.push({
      key: 'administration',
      href: '/home/admin',
      labelKey: 'home.administration',
    });
    subMenus.home.push({
      key: 'balance-sim',
      href: '/home/admin/balance-sim',
      labelKey: 'Balance Simulator',
    });
  }

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
      const subMenu = subMenus.battle || [];
      setActiveSubMenu(subMenu);
      setActiveSubKey('attack');
      setDefaultParentKey('battle');
      setDefaultSubMenu(subMenus.battle || []);
    } else if (secondPath === 'history') {
      setActiveParentKey('battle');
      const subMenu = subMenus.battle || [];
      setActiveSubMenu(subMenu);
      setActiveSubKey('warHistory');
      setDefaultParentKey('battle');
      setDefaultSubMenu(subMenus.battle || []);
    } else if (currentPath === 'auto-recruit') {
      setActiveParentKey('community');
      const subMenu = subMenus.community || [];
      setActiveSubMenu(subMenu);
      setActiveSubKey('autoRecruit');
      setDefaultParentKey('community');
      setDefaultSubMenu(subMenus.community || []);
    } else if (currentPath === 'alliances') {
      setActiveParentKey('alliances');
      const subMenu = subMenus.alliances || [];
      setActiveSubMenu(subMenu);
      // Determine sub key based on secondPath
      if (secondPath === 'create') setActiveSubKey('create');
      else setActiveSubKey('browse'); // Default to browse

      setDefaultParentKey('alliances');
      setDefaultSubMenu(subMenus.alliances || []);
    } else {
      const activeLink = parentLinks.find((link) => link.key === currentPath);
      if (activeLink) {
        setActiveParentKey(activeLink.key);
        const subMenu = subMenus[activeLink.key] || [];
        setActiveSubMenu(subMenu);

        // Find the active sub link
        const activeSubLinkItem = subMenu.find(
          (item) => item.key === secondPath,
        );
        if (activeSubLinkItem) {
          setActiveSubKey(activeSubLinkItem.key);
        } else {
          // Reset the active sub link if no match found
          setActiveSubKey('');
        }
        setDefaultParentKey(activeLink.key);
        setDefaultSubMenu(subMenus[activeLink.key] || []);
      }
    }
  }, [pathName, router.locale]);

  const [resetTimer, setResetTimer] = useState<number | null>(null);

  const fetchSocialNotifications = useCallback(async () => {
    try {
      const response = await fetch('/api/social/notifications/count');
      if (!response.ok) return;
      const data = await response.json();
      setSocialNotificationCount(Number(data.count) || 0);
    } catch {
      // keep existing count on failure
    }
  }, []);

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
    children?: {
      key: string;
      label: string;
      href?: string;
      onClick?: () => void;
    }[];
  }[] = parentLinks.map((parent) => {
    const children = subMenus[parent.key]?.map((item) => ({
      key: item.key,
      label: tNav(item.labelKey),
      href: item.href,
    }));
    return {
      key: parent.key,
      label: tNav(parent.labelKey),
      children,
    };
  });

  allMenuItems.push({
    key: 'signout',
    label: tNav('actions.signOut'),
    onClick: () => signOut({ callbackUrl: '/' }),
  });

  const notificationSum = unreadMessagesCount + socialNotificationCount;
  const badgeLabel = notificationSum > 9 ? '9+' : `${notificationSum}`;
  const isImpersonating = Boolean((session?.user as any)?.impersonatedBy);

  const handleStopImpersonation = useCallback(async () => {
    try {
      await fetch('/api/admin/impersonate/stop', {
        method: 'POST',
      });
    } finally {
      await signOut({ callbackUrl: '/account/login' });
    }
  }, []);

  if (isImpersonating) {
    allMenuItems.push({
      key: 'endImpersonation',
      label: 'End Impersonation',
      onClick: handleStopImpersonation,
    });
  }

  return (
    <>
      <div
        className={`flex justify-end p-2 lg:hidden ${layoutCont.raceClasses.menuPrimaryClass}`}
        style={{
          backgroundImage: `url('${getAssetPath('top-menu', null, user?.colorScheme as PlayerRace)}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="relative">
          <button
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
          </button>
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
        className="lg:hidden"
      />
      <div onMouseLeave={resetMenu} onMouseEnter={clearReset}>
        <nav
          className={`hidden h-10 ${layoutCont.raceClasses.menuPrimaryClass} lg:block`}
          style={{
            backgroundImage: `url('${getAssetPath('top-menu', null, user?.colorScheme as PlayerRace)}')`,
          }}
          onMouseEnter={clearReset}
          role="navigation"
        >
          <div className="mx-auto max-w-screen-2xl justify-center lg:block">
            <ul className="flex flex-wrap items-center justify-center py-1 text-center text-lg md:text-xl">
              {parentLinks.map((link) => {
                return (
                  <li className="px-4 lg:px-6 " key={link.key}>
                    <Link
                      href={link.href || '/'}
                      className={`border-none ${
                        activeParentKey === link.key
                          ? 'bg-orange-gradient text-gradient-orange'
                          : 'text-elf-link-link'
                      }  bg-link-gradient font-bold transition duration-200 text-shadow text-shadow-xs text-uppercase-menu text-gradient-link hover:bg-orange-gradient hover:text-gradient-orange`}
                      onMouseOver={() => {
                        setActiveSubMenu(subMenus[link.key] || []);
                      }}
                      data-testid={`nav-${link.key}-link`}
                      aria-label={tNav(link.labelKey)}
                    >
                      {tNav(link.labelKey)}
                    </Link>
                  </li>
                );
              })}
              <li className="xs:px-6 px-3" key="signOut">
                {isImpersonating && (
                  <button
                    type="button"
                    onClick={handleStopImpersonation}
                    className="mr-4 border-none bg-link-gradient font-bold transition duration-200 text-shadow text-shadow-sm text-uppercase-menu text-gradient-link hover:bg-orange-gradient hover:text-gradient-orange"
                    data-testid="desktop-end-impersonation-button"
                  >
                    End Impersonation
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className={`border-none ${
                    activeParentKey === 'signout'
                      ? 'text-elf-link-current'
                      : 'text-elf-link-link'
                  } bg-link-gradient font-bold transition duration-200 text-shadow text-shadow-sm text-uppercase-menu text-gradient-link hover:bg-orange-gradient hover:text-gradient-orange`}
                  data-testid="desktop-sign-out-button"
                >
                  {tNav('actions.signOut')}
                </button>
              </li>
            </ul>
          </div>
        </nav>
        <nav
          className={`hidden h-10 ${layoutCont.raceClasses.menuSecondaryClass} lg:block`}
          style={{
            backgroundImage: `url('${getAssetPath('bottom-menu', null, user?.colorScheme as PlayerRace)}')`,
          }}
          onMouseEnter={clearReset}
          role="navigation"
        >
          <div className="mx-auto max-w-screen-2xl justify-center lg:block">
            <ul className="flex flex-wrap items-center justify-center py-1 text-center text-xl">
              {activeSubMenu.map((item) => (
                <li key={`${item.key}.${item.href}`} className="px-10">
                  <Indicator
                    inline
                    offset={-10}
                    position="middle-end"
                    color="brand.2"
                    size={8}
                    processing
                    disabled
                  >
                    <Link
                      href={item.href}
                      className={`border-none
                      ${
                        activeSubKey === item.key
                          ? 'bg-orange-gradient text-gradient-orange'
                          : 'text-elf-link-link'
                      } bg-link-gradient font-bold transition duration-200 text-shadow text-shadow-xs text-gradient-link hover:bg-orange-gradient hover:text-gradient-orange
                    `}
                      target={item.target ? item.target : '_self'}
                      data-testid="nav-link"
                    >
                      {tNav(item.labelKey)}
                    </Link>
                  </Indicator>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </>
  );
};
