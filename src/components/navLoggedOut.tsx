import { UnstyledButton } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import Image from '@/components/ArtworkImage';
import classes from '@/components/navLoggedIn.module.css';
import { getAssetPath } from '@/utils/utilities';

import MobileNavigation from './MobileNavigation';

const parentLinks = [
  { key: 'home', labelKey: 'loggedOut.home', icon: 'home', url: '/' },
  {
    key: 'howToPlay',
    icon: 'battle',
    labelKey: 'loggedOut.howToPlay',
    url: '/how-to-play',
  },
  {
    key: 'community',
    icon: 'community',
    labelKey: 'main.community',
    url: '/community/news',
  },

  {
    key: 'login',
    icon: 'settings',
    labelKey: 'loggedOut.login',
    url: '/account/login',
  },
  {
    key: 'signup',
    icon: 'alliances',
    labelKey: 'loggedOut.signup',
    url: '/account/register',
  },
] as const;

const subMenus = {
  home: [
    { key: 'home', labelKey: 'loggedOut.home', url: '/' },
    { key: 'about', labelKey: 'loggedOut.about', url: '/about' },
  ],
  howToPlay: [
    { key: 'howToPlay', labelKey: 'loggedOut.howToPlay', url: '/how-to-play' },
    { key: 'faq', labelKey: 'loggedOut.faq', url: '/faq' },
  ],
  community: [
    { key: 'news', labelKey: 'loggedOut.news', url: '/community/news' },
    { key: 'stats', labelKey: 'loggedOut.stats', url: '/community/stats' },
  ],
};

/** Nav logged out. */
export const NavLoggedOut: React.FC = () => {
  const router = useRouter();
  const pathName = router.asPath?.split('?')[0] ?? '/';
  const { t: tNav } = useTranslation('navigation');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [previewParent, setPreviewParent] = useState<string | null>(null);
  const localePrefix = router.locale ? `/${router.locale}` : '';
  const normalizedPath =
    localePrefix && pathName.startsWith(`${localePrefix}/`)
      ? pathName.slice(localePrefix.length) || '/'
      : pathName === localePrefix
        ? '/'
        : pathName;
  const getChildren = (key: string) =>
    subMenus[key as keyof typeof subMenus] ?? [];
  const activeParent = parentLinks.find(
    (link) =>
      link.url === normalizedPath ||
      getChildren(link.key).some((child) => child.url === normalizedPath),
  );
  const visibleChildren = getChildren(
    previewParent ?? activeParent?.key ?? 'home',
  );
  const menuItems = parentLinks.map((link) => ({
    key: link.key,
    label: tNav(link.labelKey),
    href: link.url,
    children: getChildren(link.key).map((child) => ({
      key: child.key,
      label: tNav(child.labelKey),
      href: child.url,
    })),
  }));

  return (
    <>
      <UnstyledButton
        type="button"
        className="block min-h-[48px] min-w-[48px] p-2 text-[var(--ot-heading)] hover:text-[var(--ot-accent)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white focus-visible:underline lg:hidden"
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
      </UnstyledButton>
      <MobileNavigation
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        menuItems={menuItems}
        className="lg:hidden"
      />
      <div
        onMouseLeave={() => setPreviewParent(null)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setPreviewParent(null);
        }}
      >
        <nav
          className={`hidden h-10 bg-elf-menu-primary lg:block ${classes.primary}`}
          style={{
            backgroundImage: `url('${getAssetPath('top-menu', null, 'ELF')}')`,
          }}
          role="navigation"
        >
          <div className="mx-auto max-w-screen-2xl lg:block">
            <ul className={classes.primaryList}>
              {parentLinks.map((link) => (
                <li key={link.key}>
                  <Link
                    href={link.url}
                    onMouseEnter={() => setPreviewParent(link.key)}
                    onFocus={() => setPreviewParent(link.key)}
                    className={classes.navLink}
                    data-active={activeParent?.key === link.key || undefined}
                    aria-current={
                      normalizedPath === link.url ? 'page' : undefined
                    }
                    data-testid={`nav-${link.key}-link`}
                  >
                    <Image
                      src={`/assets/header/nav/${link.icon}.webp`}
                      alt=""
                      width={24}
                      height={24}
                      className={classes.icon}
                    />
                    <span>{tNav(link.labelKey)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <nav
          className={`hidden h-10 lg:block ${classes.secondary}`}
          style={{
            backgroundImage: `url('${getAssetPath('bottom-menu', null, 'ELF')}')`,
          }}
          aria-label={tNav('ariaLabels.subNavigation')}
        >
          <ul className={classes.secondaryList}>
            {visibleChildren.map((link) => (
              <li key={link.key}>
                <Link
                  href={link.url}
                  className={classes.subLink}
                  data-active={normalizedPath === link.url || undefined}
                  aria-current={
                    normalizedPath === link.url ? 'page' : undefined
                  }
                >
                  {tNav(link.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
};
