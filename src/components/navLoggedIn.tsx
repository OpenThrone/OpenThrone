/* eslint-disable jsx-a11y/anchor-is-valid */
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { useLayout } from '@/context/LayoutContext';
import { useUser } from '@/context/users';
import { Indicator } from '@mantine/core';

import { PermissionType } from '@prisma/client';
import { getAssetPath } from '@/utils/utilities';
import { PlayerRace } from '@/types/typings';

const parentLinks = [
  'Home',
  'Battle',
  'Structures',
  //'Social',
  // 'Alliances',
  'Community',
] as const;

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
    { text: 'Bank', href: '/structures/bank', parent: 'Structures' },
    { text: 'Armory', href: '/structures/armory', parent: 'Structures' },
    { text: 'Upgrades', href: '/structures/upgrades', parent: 'Structures' },
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
};

export const NavLoggedIn: React.FC = () => {
  const pathName = usePathname();
  const searchParms = useSearchParams();
  const [activeSubMenu, setActiveSubMenu] = useState<
    { text: string; href: string; parent: string, target?: string }[]
  >([]);
  const [activeParentLink, setActiveParentLink] = useState<string>('');
  const [activeSubLink, setActiveSubLink] = useState<string>('');

  const [defaultSubMenu, setDefaultSubMenu] = useState<
    { text: string; href: string; parent: string }[]
  >([]);
  const [defaultParentLink, setDefaultParentLink] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const layoutCont = useLayout();
  const { user } = useUser();

  // Add the administration link only if the user has admin privileges
  if (
    user?.permissions?.some((perm) => perm.type === PermissionType.ADMINISTRATOR) &&
    !subMenus.Home.some((subNav) => subNav.text === 'Administration')
  ) {
      subMenus.Home.push({
        text: 'Administration',
        href: '/home/admin',
        parent: 'Home',
      });
  }

  const handleParentClick = (event: React.MouseEvent, link: string) => {
    event.preventDefault();
    if (link === activeParentLink) {
      setActiveParentLink('');
      setActiveSubMenu([]);
    } else {
      setActiveParentLink(link);
      setActiveSubMenu(subMenus[link as keyof typeof subMenus] || []);
    }

    // Close mobile menu
    // setMobileMenuOpen(false);
  };

  useEffect(() => {
    let currentPath = pathName?.split('/')[1]; // Extract the base path
    let secondPath = pathName?.split('/')[2];
    if (pathName === '/') {
      currentPath = 'home';
      secondPath = 'overview';
    }

    if (currentPath === 'userprofile' || (currentPath === 'battle' && secondPath === 'users')) {
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
    } else if(currentPath === 'auto-recruit') {
      setActiveParentLink('Community');
      const subMenu = subMenus.Community || [];
      setActiveSubMenu(subMenu);
      setActiveSubLink('Auto Recruit');
      setDefaultParentLink('Community');
      setDefaultSubMenu(subMenus.Community || []);
    } else {
      const activeLink = parentLinks.find(
        (link) => link.toLowerCase() === currentPath
      );
      if (activeLink) {
        setActiveParentLink(activeLink);
        const subMenu = subMenus[activeLink] || [];
        setActiveSubMenu(subMenu);

        // Find the active sub link
        const activeSubLinkItem = subMenu.find(
          (item) => item.text.toLowerCase() === secondPath
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
  }, [pathName, searchParms]);

  const [resetTimer, setResetTimer] = useState<number | null>(null);

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
  return (
    <>
      <button
        type="button"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="block md:hidden"
      >
        {mobileMenuOpen ? 'Close' : 'Open'} Menu
      </button>
      <nav className={mobileMenuOpen ? 'block md:hidden' : 'hidden md:hidden'}>
        <ul className="text-center text-xl">
          {parentLinks.map((link) => (
            <li className="mr-6" key={link}>
              <Link
                href="#"
                className={`${activeParentLink === link
                  ? 'bg-orange-gradient text-gradient-orange'
                  : 'text-elf-link-link'
                  } text-uppercase-menu bg-link-gradient text-gradient-link font-bold hover:bg-orange-gradient hover:text-gradient-orange transition duration-200 text-shadow text-shadow-md text-shadow-color-black`}
                onClick={(event) => handleParentClick(event, link)}
              >
                {link}
              </Link>
              {activeParentLink === link && (
                <ul>
                  {activeSubMenu.map((subLink) => (
                    <li
                      className="mr-6 pl-4"
                      key={`${subLink.href}.${subLink.text}`}
                    >
                      <Link href={subLink.href} target={subLink.target ? subLink.target : '_self'}
                        className={`border-none
                      ${activeSubLink === subLink.text
                            ? 'text-gradient-orange bg-orange-gradient'
                            : 'text-elf-link-link'
                          } bg-link-gradient text-gradient-link font-bold hover:bg-orange-gradient hover:text-gradient-orange transition duration-200 text-shadow-xs
                    `} >{subLink.text}</Link>                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div onMouseLeave={resetMenu} onMouseEnter={clearReset}>
        <nav
          className={`hidden h-10 ${layoutCont.raceClasses.menuPrimaryClass} md:block`}
          style={{backgroundImage: `url('${getAssetPath('top-menu', null, user?.colorScheme)}')`}}
          onMouseEnter={clearReset}
        >
          <div className="mx-auto max-w-screen-lg md:block justify-center">
            <ul className="flex flex-wrap items-center justify-center text-center text-lg md:text-xl py-1">
              {parentLinks.map((link) => {
                return (
                  <li className="px-4 lg:px-6 " key={link}>
                    <Link
                      href="/"
                      className={`border-none ${
                        activeParentLink === link
                        ? 'bg-orange-gradient text-gradient-orange'
                          : 'text-elf-link-link'
                      }  text-uppercase-menu bg-link-gradient text-gradient-link font-bold hover:bg-orange-gradient hover:text-gradient-orange transition duration-200 text-shadow text-shadow-xs`}
                      onMouseOver={() => {
                        setActiveSubMenu(subMenus[link] || []);
                      }}
                    >
                        {link}
                    </Link>
                  </li>
                );
              })}
              <li className="xs:px-6 px-3" key={'signOut'}>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className={`border-none ${
                    activeParentLink === 'signout'
                      ? 'text-elf-link-current'
                      : 'text-elf-link-link'
                  } text-uppercase-menu bg-link-gradient text-gradient-link font-bold hover:bg-orange-gradient hover:text-gradient-orange transition duration-200 text-shadow text-shadow-sm`}
                >
                  Sign Out
                </button>
              </li>
            </ul>
          </div>
        </nav>
        <nav
          className={`hidden h-10 ${layoutCont.raceClasses.menuSecondaryClass} md:block`}
          style={{ backgroundImage: `url('${getAssetPath('bottom-menu', null, user?.colorScheme as PlayerRace)}')` }}

          onMouseEnter={clearReset}
        >
          <div className="mx-auto max-w-screen-lg md:block justify-center">
            <ul className="flex flex-wrap items-center justify-center text-center text-xl py-1">
              {activeSubMenu.map((item) => (
                <li
                  key={`${item.text}.${item.href}`}
                  className="px-10"
                >
                  <Indicator inline offset={-10} position="middle-end" color='brand.2' size={8} processing disabled>
                    <Link
                      href={item.href}
                      className={`border-none
                      ${
                        activeSubLink === item.text
                        ? 'text-gradient-orange bg-orange-gradient'
                          : 'text-elf-link-link'
                    } bg-link-gradient text-gradient-link font-bold hover:bg-orange-gradient hover:text-gradient-orange transition duration-200 text-shadow text-shadow-xs
                    `}
                      target={item.target ? item.target : '_self'}
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
