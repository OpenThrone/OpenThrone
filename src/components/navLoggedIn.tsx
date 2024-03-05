/* eslint-disable jsx-a11y/anchor-is-valid */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { useLayout } from '@/context/LayoutContext';

const parentLinks = [
  'Home',
  'Battle',
  'Structures',
  // 'Alliances',
  'Community',
] as const;

const subMenus: {
  [K in (typeof parentLinks)[number]]?: {
    text: string;
    href: string;
    parent: string;
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
    {
      text: 'Report Issues',
      href: 'https://github.com/uaktags/OpenThrone/issues',
      parent: 'Community',
    },
  ],
};

export const NavLoggedIn: React.FC = () => {
  const pathName = usePathname();
  const [activeSubMenu, setActiveSubMenu] = useState<
    { text: string; href: string; parent: string }[]
  >([]);
  const [activeParentLink, setActiveParentLink] = useState<string>('');
  const [, setActiveSubLink] = useState<string>('');

  const [defaultSubMenu, setDefaultSubMenu] = useState<
    { text: string; href: string; parent: string }[]
  >([]);
  const [defaultParentLink, setDefaultParentLink] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const layoutCont = useLayout();

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

    if (currentPath === 'userprofile') {
      setActiveParentLink('Battle');
      const subMenu = subMenus.Battle || [];
      setActiveSubMenu(subMenu);
      setActiveSubLink('Attack');
      setDefaultParentLink('Battle');
      setDefaultSubMenu(subMenus.Battle || []);
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
  }, [pathName]);

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
                className="border-none text-gray-700 hover:text-gray-900"
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
                      <Link href={subLink.href}>{subLink.text}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div onMouseLeave={resetMenu} onMouseEnter={clearReset}>
        <nav
          className={`hidden h-8 ${layoutCont.raceClasses.menuPrimaryClass} md:block`}
          onMouseEnter={clearReset}
        >
          <div className="mx-auto max-w-screen-md md:block">
            <ul className="flex flex-wrap items-center justify-evenly text-center text-xl">
              {parentLinks.map((link) => {
                return (
                  <li className="px-6" key={link}>
                    <Link
                      href="/"
                      className={`border-none ${
                        activeParentLink === link
                          ? layoutCont.raceClasses.navActiveClass
                          : 'text-elf-link-link'
                      } hover:text-elf-link-hover `}
                      onMouseOver={() => {
                        setActiveSubMenu(subMenus[link] || []);
                      }}
                    >
                      {link}
                    </Link>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className={`border-none ${
                    activeParentLink === 'signout'
                      ? 'text-elf-link-current'
                      : 'text-elf-link-link'
                  } hover:text-elf-link-hover `}
                >
                  Sign Out
                </button>
              </li>
            </ul>
          </div>
        </nav>
        <nav
          className={`hidden h-8 ${layoutCont.raceClasses.menuSecondaryClass} md:block`}
          onMouseEnter={clearReset}
        >
          <div className="mx-auto max-w-screen-md">
            <ul className="flex flex-wrap justify-evenly text-center text-xl">
              {activeSubMenu.map((item) => (
                <li
                  key={`${item.text}.${item.href}`}
                  className="mx-4 cursor-pointer"
                >
                  <Link
                    href={item.href}
                    className={`
                      text-elf-link-link
                    `}
                  >
                    {item.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </>
  );
};
