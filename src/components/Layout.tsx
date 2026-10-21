import { useLocalStorage, useMediaQuery } from '@mantine/hooks';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import ArtworkPreviewSelector from '@/components/ArtworkPreviewSelector';
import EraResetNotice from '@/components/EraResetNotice';
import MobileSidebarContent from '@/components/MobileSidebarContent';
import { NavLoggedIn } from '@/components/navLoggedIn';
import { NavLoggedOut } from '@/components/navLoggedOut';
import {
  SHOWCASE_BACKDROP_KEY,
  SHOWCASE_DEFAULT_VEIL,
  SHOWCASE_VEIL_KEY,
  showcaseBackdropSource,
} from '@/components/showcase/backdrops';
import Sidebar from '@/components/Sidebar';
import { useLayout } from '@/context/LayoutContext';
import { AppConfig } from '@/utils/AppConfig';
import { APP_VERSION_LABEL } from '@/utils/appVersion';
import { resolveArtworkSource } from '@/utils/artwork';
import { logError } from '@/utils/logger';

import ConnectionStatusBanner from './ConnectionStatusBanner';
import GameHeader from './GameHeader';
import shellClasses from './GameShell.module.css';
import MainAreaSkeleton from './MainAreaSkeleton';
import NavSkeleton from './NavSkeleton';
import NewPlayerWalkthrough from './NewPlayerWalkthrough';
import SidebarSkeleton from './SidebarSkeleton';

const publicFooterLinks = [
  { key: 'home', labelKey: 'loggedOut.home', url: '/' },
  { key: 'howToPlay', labelKey: 'loggedOut.howToPlay', url: '/how-to-play' },
  { key: 'faq', labelKey: 'loggedOut.faq', url: '/faq' },
  { key: 'news', labelKey: 'loggedOut.news', url: '/community/news' },
  { key: 'stats', labelKey: 'loggedOut.stats', url: '/community/stats' },
  { key: 'about', labelKey: 'loggedOut.about', url: '/about' },
  {
    key: 'discord',
    labelKey: 'loggedOut.discord',
    url: 'https://discord.com/invite/j9NYxmBCjA',
    external: true,
  },
  {
    key: 'github',
    labelKey: 'loggedOut.github',
    url: 'https://github.com/OpenThrone/OpenThrone',
    external: true,
  },
] as const;

interface IMainProps {
  children: ReactNode;
}

const Layout = (props: IMainProps) => {
  const { t } = useTranslation('common');
  const { t: tNav } = useTranslation('navigation');
  const { status } = useSession();
  const { raceClasses, authorized, userLoading: layoutLoading } = useLayout();
  const nextRouter = useRouter();
  const isAdminRoute = useMemo(
    () =>
      nextRouter.pathname.startsWith('/home/admin') ||
      nextRouter.pathname.startsWith('/home/moderation'),
    [nextRouter.pathname],
  );
  // The /test showcase can preview other artwork behind the game shell.
  const [showcaseBackdrop] = useLocalStorage<string>({
    key: SHOWCASE_BACKDROP_KEY,
    defaultValue: 'default',
  });
  const [showcaseVeil] = useLocalStorage<number>({
    key: SHOWCASE_VEIL_KEY,
    defaultValue: SHOWCASE_DEFAULT_VEIL,
  });
  const isShowcase = nextRouter.pathname === '/test';
  const shellArtSource = resolveArtworkSource(
    (isShowcase
      ? showcaseBackdropSource(showcaseBackdrop)
      : '/assets/header/openthrone-bg.png') ?? '',
  );
  const isMobileSidebar = useMediaQuery('(max-width: 767px)', false, {
    getInitialValueInEffect: true,
  });
  const [gitInfo, setGitInfo] = useState({
    latestCommit: '',
    latestCommitMessage: '',
  });
  const [onlinePlayerInfo, setOnlinePlayerInfo] = useState({
    onlinePlayers: 0,
    totalPlayers: 0,
    newestPlayer: '',
    newPlayers: 0,
  });
  const [isDevelopment] = useState(
    () => process.env.NODE_ENV === 'development',
  );

  useEffect(() => {
    if (isDevelopment) {
      fetch('/api/general/git-info')
        .then((response) => {
          if (!response.ok) {
            throw new Error(t('errors.failedToFetchGitInfo'));
          }
          return response.json();
        })
        .then((data) => {
          setGitInfo(data);
        })
        .catch((error) => {
          logError(`${t('errors.failedToFetchGitInfo')}:`, error);
        });
    } else {
      fetch('/api/general/getOnlinePlayers')
        .then((response) => {
          if (!response.ok) {
            throw new Error(t('errors.failedToFetchOnlinePlayerInfo'));
          }
          return response.json();
        })
        .then((data) => {
          setOnlinePlayerInfo({
            onlinePlayers: data.onlineUsers,
            totalPlayers: data.allUsersCounted,
            newestPlayer: data.newestUser,
            newPlayers: data.newUsers,
          });
        })
        .catch((error) => {
          logError(`${t('errors.failedToFetchOnlinePlayerInfo')}:`, error);
        });
    }
  }, [isDevelopment]);

  const structureReady = authorized || status !== 'loading';

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        {t('skipToContent')}
      </a>
      <div
        className={`w-full grow ${
          authorized ? raceClasses.bgClass : 'bg-elf-header-bgcolor'
        } px-1 text-yellow-400 antialiased`}
      >
        <div className="mx-auto w-full max-w-screen-2xl">
          <header className={`${raceClasses.borderBottomClass}`}>
            <ArtworkPreviewSelector />
            <GameHeader />
            {status === 'loading' ? (
              <NavSkeleton />
            ) : authorized ? (
              <NavLoggedIn
                sidebarContent={
                  <MobileSidebarContent isMobile={isMobileSidebar} />
                }
                data-tour-id="primary-nav"
              />
            ) : (
              <NavLoggedOut />
            )}
          </header>
          <main
            className="h-full grow overflow-y-auto px-3 pb-8"
            id="main-content"
            tabIndex={-1}
          >
            <div
              className={`flex h-full flex-wrap xl:flex-nowrap ${shellClasses.content}`}
            >
              {structureReady ? (
                <>
                  {authorized && !isAdminRoute && (
                    <div
                      data-tour-id="sidebar"
                      className={`hidden w-full xl:block xl:w-[260px] xl:pr-4 ${shellClasses.sidebar}`}
                    >
                      {layoutLoading ? <SidebarSkeleton /> : <Sidebar />}
                    </div>
                  )}
                  <div
                    style={
                      {
                        '--shell-art': shellArtSource
                          ? `url("${shellArtSource}")`
                          : 'none',
                        ...(isShowcase && {
                          '--showcase-veil': showcaseVeil / 100,
                        }),
                      } as React.CSSProperties
                    }
                    data-tour-id="main-area"
                    data-showcase-backdrop={isShowcase || undefined}
                    className={`w-full ${raceClasses.borderClass} ${authorized ? 'xl:flex-1' : 'xl:w-full'} mainArea-bg min-w-0`}
                  >
                    <ConnectionStatusBanner />
                    <EraResetNotice />
                    {layoutLoading ? <MainAreaSkeleton /> : props.children}
                  </div>
                </>
              ) : (
                <div
                  className="w-full"
                  style={{ backgroundColor: 'var(--ot-surface)' }}
                >
                  <MainAreaSkeleton />
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
      <footer className="shrink-0 border-t border-gray-300 bg-black py-3 text-center text-sm text-[var(--ot-text)]">
        {!authorized && (
          <nav
            className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs"
            aria-label="Footer navigation"
          >
            {publicFooterLinks.map((link) => {
              const label = tNav(link.labelKey);
              if ('external' in link && link.external) {
                return (
                  <a
                    key={link.key}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--ot-text)] opacity-70 transition-opacity hover:opacity-100"
                  >
                    {label}
                  </a>
                );
              }
              return (
                <Link
                  key={link.key}
                  href={link.url}
                  className="text-[var(--ot-text)] opacity-70 transition-opacity hover:opacity-100"
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
        <p className="mb-2 px-4 text-xs text-[var(--ot-muted)]">
          {t('footer.operator', {
            defaultValue:
              'OpenThrone.dev is operated by AIOXperts IT Solutions LLC.',
          })}
        </p>
        {t('app.copyright', {
          year: new Date().getFullYear(),
          title: AppConfig.title,
        })}
        <br />
        <div className="text-xs">
          {isDevelopment ? (
            <>
              <p>
                <strong>{t('footer.latestCommit')}</strong>{' '}
                {gitInfo.latestCommit}
              </p>
              <p>
                <strong>{t('footer.latestCommitMessage')}</strong>{' '}
                {gitInfo.latestCommitMessage}
              </p>
            </>
          ) : (
            <>
              <p>
                <strong>{t('footer.onlinePlayers')}</strong>{' '}
                {onlinePlayerInfo.onlinePlayers} /{' '}
                {onlinePlayerInfo.totalPlayers}
              </p>
              <p>
                <strong>{t('footer.newPlayersLast24hrs')}</strong>{' '}
                {onlinePlayerInfo.newPlayers}
              </p>
              <p>
                <strong>{t('footer.newestPlayer')}</strong>{' '}
                {onlinePlayerInfo.newestPlayer}
              </p>
            </>
          )}
          {APP_VERSION_LABEL && (
            <p className="opacity-70">
              {t('footer.version', { version: APP_VERSION_LABEL })}
            </p>
          )}
        </div>
      </footer>
      {authorized && <NewPlayerWalkthrough />}
    </div>
  );
};
export default Layout;
