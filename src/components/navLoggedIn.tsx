/* eslint-disable jsx-a11y/anchor-is-valid */
import { Badge, Indicator } from '@mantine/core';
import { PermissionType } from '@prisma/client';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useLayout } from '@/context/LayoutContext';
import { useUser } from '@/context/users';
import type { PlayerRace } from '@/types/typings';
import { getAssetPath } from '@/utils/utilities';

import MobileNavigation from './MobileNavigation';

const parentLinks = [
  'Home',
  'Battle',
  'Social',
  'Structures',
  // 'Alliances',
  'Community',
  'About',
] as const;

const parentHrefs: Record<string, string> = {
  Home: '/home/overview',
  Battle: '/battle/users',
  Social: '/social/friends',
  Structures: '/structures/bank/deposit',
  Community: '/community/news',
  About: '/about',
};

const subMenus: {
  [K in (typeof parentLinks)[number]]?: {
    text: string;
    href: string;
    parent: string;
    target?: string;
  }[];
} = {
  Home: [
    { text: 'Overview', href: '/home/overview', parent: 'Home' },
    { text: 'Levels', href: '/home/levels', parent: 'Home' },
    { text: 'Profile', href: '/home/profile', parent: 'Home' },
    { text: 'Settings', href: '/home/settings', parent: 'Home' },
  ],
  Battle: [
    { text: 'Attack', href: '/battle/users', parent: 'Battle' },
    { text: 'Training', href: '/battle/training', parent: 'Battle' },
    { text: 'Upgrades', href: '/battle/upgrades', parent: 'Battle' },
    { text: 'War History', href: '/battle/history', parent: 'Battle' },
  ],
  Social: [
    { text: 'Friends', href: '/social/friends', parent: 'Social' },
    { text: 'Enemies', href: '/social/enemies', parent: 'Social' },
    { text: 'Requests', href: '/social/requests', parent: 'Social' },
  ],
  Structures: [
    {
      text: 'Bank',
      href: '/structures/bank/deposit',
      parent: 'Structures',
    },
    {
      text: 'Armory',
      href: '/structures/armory/offense',
      parent: 'Structures',
    },
    {
      text: 'Upgrades',
      href: '/structures/upgrades/fortifications',
      parent: 'Structures',
    },
    { text: 'Housing', href: '/structures/housing', parent: 'Structures' },
    { text: 'Repair', href: '/structures/repair', parent: 'Structures' },
  ],
  // Alliances: [{ text: 'Test', href: '#' }],
  Community: [
    {
      text: 'News',
      href: '/community/news',
      parent: 'Community',
    },
    {
      text: 'Discord',
      href: 'https://discord.gg/j9NYxmBCjA',
      parent: 'Community',
    },
    { text: 'Auto Recruit', href: '/auto-recruit', parent: 'Community' },
    { text: 'Stats', href: '/community/stats', parent: 'Community' },
    {
      text: 'Report Issues',
      href: 'https://github.com/uaktags/OpenThrone/issues',
      parent: 'Community',
      target: '_blank',
    },
  ],
  About: [],
};

interface NavLoggedInProps {
  sidebarContent?: ReactNode;
}

export const NavLoggedIn: React.FC<NavLoggedInProps> = ({ sidebarContent }) => {
  const router = useRouter();
  const pathName = router.asPath?.split('?')[0] ?? '/';
  const { t } = useTranslation('common');
  const [activeSubMenu, setActiveSubMenu] = useState<
    { text: string; href: string; parent: string; target?: string }[]
  >([]);
  const [activeParentLink, setActiveParentLink] = useState<string>('');
  const [activeSubLink, setActiveSubLink] = useState<string>('');

  const [defaultSubMenu, setDefaultSubMenu] = useState<
    { text: string; href: string; parent: string }[]
  >([]);
  const [defaultParentLink, setDefaultParentLink] = useState<string>('');
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
    !subMenus.Home.some((subNav) => subNav.text === 'Administration')
  ) {
    subMenus.Home.push({
      text: 'Administration',
      href: '/home/admin',
      parent: 'Home',
    });
  }

  useEffect(() => {
    let currentPath = pathName?.split('/')[1]; // Extract the base path
    let secondPath = pathName?.split('/')[2];
    if (pathName === '/') {
      currentPath = 'home';
      secondPath = 'overview';
    }

    if (
      currentPath === 'userprofile' ||
      (currentPath === 'battle' && secondPath === 'users')
    ) {
      setActiveParentLink('Battle');
      const subMenu = subMenus.Battle || [];
      setActiveSubMenu(subMenu);
      setActiveSubLink('Attack');
      setDefaultParentLink('Battle');
      setDefaultSubMenu(subMenus.Battle || []);
    } else if (secondPath === 'history') {
      setActiveParentLink('Battle');
      const subMenu = subMenus.Battle || [];
      setActiveSubMenu(subMenu);
      setActiveSubLink('War History');
      setDefaultParentLink('Battle');
      setDefaultSubMenu(subMenus.Battle || []);
    } else if (currentPath === 'auto-recruit') {
      setActiveParentLink('Community');
      const subMenu = subMenus.Community || [];
      setActiveSubMenu(subMenu);
      setActiveSubLink('Auto Recruit');
      setDefaultParentLink('Community');
      setDefaultSubMenu(subMenus.Community || []);
    } else {
      const activeLink = parentLinks.find(
        (link) => link.toLowerCase() === currentPath,
      );
      if (activeLink) {
        setActiveParentLink(activeLink);
        const subMenu = subMenus[activeLink] || [];
        setActiveSubMenu(subMenu);

        // Find the active sub link
        const activeSubLinkItem = subMenu.find(
          (item) => item.text.toLowerCase() === secondPath,
        );
        if (activeSubLinkItem) {
          setActiveSubLink(activeSubLinkItem.text);
        } else {
          // Reset the active sub link if no match found
          setActiveSubLink('');
        }
        setDefaultParentLink(activeLink);
        setDefaultSubMenu(subMenus[activeLink] || []);
      }
    }
  }, [pathName]);

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
      setActiveParentLink(defaultParentLink);
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
    const children = subMenus[parent]?.map((item) => ({
      key: item.href,
      label: item.text,
      href: item.href,
    }));
    return {
      key: parent,
      label: parent,
      children,
    };
  });

  allMenuItems.push({
    key: 'signout',
    label: 'Sign Out',
    onClick: () => signOut({ callbackUrl: '/' }),
  });

  const notificationSum = unreadMessagesCount + socialNotificationCount;
  const badgeLabel = notificationSum > 9 ? '9+' : `${notificationSum}`;

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
            aria-label={t('ariaLabels.openMenu')}
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
              aria-label={t('ariaLabels.unreadNotifications', {
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
                  <li className="px-4 lg:px-6 " key={link}>
                    <Link
                      href={parentHrefs[link] || '/'}
                      className={`border-none ${
                        activeParentLink === link
                          ? 'bg-orange-gradient text-gradient-orange'
                          : 'text-elf-link-link'
                      }  bg-link-gradient font-bold transition duration-200 text-shadow text-shadow-xs text-uppercase-menu text-gradient-link hover:bg-orange-gradient hover:text-gradient-orange`}
                      onMouseOver={() => {
                        setActiveSubMenu(subMenus[link] || []);
                      }}
                      data-testid={`nav-${link.toLowerCase()}-link`}
                      aria-label={link}
                    >
                      {link}
                    </Link>
                  </li>
                );
              })}
              <li className="xs:px-6 px-3" key="signOut">
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className={`border-none ${
                    activeParentLink === 'signout'
                      ? 'text-elf-link-current'
                      : 'text-elf-link-link'
                  } bg-link-gradient font-bold transition duration-200 text-shadow text-shadow-sm text-uppercase-menu text-gradient-link hover:bg-orange-gradient hover:text-gradient-orange`}
                  data-testid="desktop-sign-out-button"
                >
                  Sign Out
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
                <li key={`${item.text}.${item.href}`} className="px-10">
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
                        activeSubLink === item.text
                          ? 'bg-orange-gradient text-gradient-orange'
                          : 'text-elf-link-link'
                      } bg-link-gradient font-bold transition duration-200 text-shadow text-shadow-xs text-gradient-link hover:bg-orange-gradient hover:text-gradient-orange
                    `}
                      target={item.target ? item.target : '_self'}
                      data-testid="nav-link"
                    >
                      {item.text}
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
