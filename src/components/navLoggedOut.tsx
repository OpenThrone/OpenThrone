import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import { getAssetPath } from '@/utils/utilities';

import MobileNavigation from './MobileNavigation';

const parentLinks = [
  { key: 'home', labelKey: 'loggedOut.home', url: '/' },
  { key: 'howToPlay', labelKey: 'loggedOut.howToPlay', url: '/how-to-play' },
  { key: 'login', labelKey: 'loggedOut.login', url: '/account/login' },
  { key: 'signup', labelKey: 'loggedOut.signup', url: '/account/register' },
  { key: 'news', labelKey: 'loggedOut.news', url: '/community/news' },
  { key: 'stats', labelKey: 'loggedOut.stats', url: '/community/stats' },
  { key: 'about', labelKey: 'loggedOut.about', url: '/about' },
] as const;

/** Nav logged out. */
export const NavLoggedOut: React.FC = () => {
  const router = useRouter();
  const pathName = router.asPath?.split('?')[0] ?? '/';
  const { t: tNav } = useTranslation('navigation');
  const [activeParentLink, setActiveParentLink] = useState<string>('');

  const [, setDefaultParentLink] = useState<string>('/');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const localePrefix = router.locale ? `/${router.locale}` : '';
    const normalizedPath =
      pathName.startsWith(localePrefix) && localePrefix !== '/'
        ? pathName.slice(localePrefix.length) || '/'
        : pathName;
    const activeLink = parentLinks.find((link) => link.url === normalizedPath);
    if (activeLink) {
      setActiveParentLink(activeLink.url);
      setDefaultParentLink(activeLink.url);
    } else {
      setActiveParentLink('');
    }
  }, [pathName, router.locale]);

  const menuItems = parentLinks.map((link) => ({
    key: link.key,
    label: tNav(link.labelKey),
    href: link.url,
  }));

  return (
    <>
      <button
        type="button"
        className="block min-h-[48px] min-w-[48px] p-2 text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white md:hidden"
        onClick={() => setMobileMenuOpen(true)}
        aria-label={tNav('ariaLabels.mobileMenuButton')}
        data-testid="mobile-menu-button"
      >
        <svg
          className="size-6"
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
      <MobileNavigation
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        menuItems={menuItems}
        className="md:hidden"
      />
      <div>
        <nav
          className="hidden bg-elf-menu-primary md:block"
          style={{
            backgroundImage: `url('${getAssetPath('top-menu', null, 'ELF')}')`,
          }}
          role="navigation"
        >
          <div className="mx-auto max-w-screen-2xl md:block">
            <ul className="flex flex-wrap items-center justify-evenly text-center text-xl">
              {parentLinks.map((link) => (
                <li className="mr-6" key={link.key}>
                  <Link
                    href={link.url}
                    className={`border-none ${
                      activeParentLink === link.url
                        ? 'bg-orange-gradient text-gradient-orange'
                        : 'text-elf-link-link'
                    }  bg-link-gradient font-bold transition duration-200 text-shadow text-shadow-sm text-uppercase-menu text-gradient-link hover:bg-orange-gradient hover:text-gradient-orange`}
                    data-testid={`nav-${link.key}-link`}
                  >
                    {tNav(link.labelKey)}
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
