/* eslint-disable jsx-a11y/anchor-is-valid */
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';

// import { userService } from 'services';
/*
interface User {
  // Define the shape of your User object here
  // For example:
  id: string;
  name: string;
  // ...
} */

const parentLinks = [
  'Home',
  'Battle',
  'Structures',
  'Alliances',
  'Community',
] as const;

const subMenus: {
  [K in (typeof parentLinks)[number]]?: { text: string; href: string }[];
} = {
  Home: [
    { text: 'Overview', href: '/home/overview' },
    { text: 'Levels', href: '/home/levels' },
    { text: 'Profile', href: '/home/profile' },
    { text: 'Settings', href: '/home/settings' },
  ],
  Battle: [
    { text: 'Attack', href: '/battle/users' },
    { text: 'Training', href: '/battle/training' },
    { text: 'Upgrades', href: '/battle/upgrades' },
    { text: 'War History', href: '/battle/history' },
  ],
  Structures: [{ text: 'Test', href: '#' }],
  Alliances: [{ text: 'Test', href: '#' }],
  Community: [{ text: 'Test', href: '#' }],
};

export const NavLoggedIn: React.FC = () => {
  const router = useRouter();
  const [activeSubMenu, setActiveSubMenu] = useState<
    { text: string; href: string }[]
  >([]);
  const [activeParentLink, setActiveParentLink] = useState<string>('');
  const [activeSubLink, setActiveSubLink] = useState<string>('');

  const [defaultSubMenu, setDefaultSubMenu] = useState<
    { text: string; href: string }[]
  >([]);
  const [defaultParentLink, setDefaultParentLink] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    let currentPath = router.pathname.split('/')[1]; // Extract the base path
    let secondPath = router.pathname.split('/')[2];
    if (router.pathname === '/') {
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
  }, [router.pathname]);

  const [resetTimer, setResetTimer] = useState<NodeJS.Timeout | null>(null);

  const resetMenu = () => {
    const timer = setTimeout(() => {
      setActiveParentLink(defaultParentLink);
      setActiveSubMenu(defaultSubMenu);
    }, 300);
    setResetTimer(timer);
  };

  // Remember to clear the timeout when the mouse enters again to prevent it from resetting while still hovering
  const clearReset = () => {
    if (resetTimer) {
      clearTimeout(resetTimer);
      setResetTimer(null);
    }
  };
  // const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // const subscription = userService.user.subscribe((x: User) => setUser(x));
    // return () => subscription.unsubscribe();
  }, []);

  // only show nav when logged in
  // if (!user) return null;

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
          className="hidden h-8 bg-elf-menu-primary md:block"
          onMouseEnter={clearReset}
        >
          <div className="mx-auto max-w-screen-md md:block">
            <ul className="flex flex-wrap items-center justify-evenly text-center text-xl">
              {parentLinks.map((link) => {
                return (
                  <li className="mr-6" key={link}>
                    <Link
                      href="/"
                      className={`border-none ${
                        activeParentLink === link
                          ? 'text-elfLink-current'
                          : 'text-elfLink-link'
                      } hover:text-elfLink-hover `}
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
                      ? 'text-elfLink-current'
                      : 'text-elfLink-link'
                  } hover:text-elfLink-hover `}
                >
                  Sign Out
                </button>
              </li>
            </ul>
          </div>
        </nav>
        <nav
          className="hidden h-8 bg-elf-menu-secondary md:block"
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
                    className={`${
                      activeSubLink === item.text
                        ? 'activeLinkClass'
                        : 'text-elfLink-link'
                    } hover:text-elfLink-hover`}
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
