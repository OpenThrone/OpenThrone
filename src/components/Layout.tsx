import { useMediaQuery } from '@mantine/hooks';
import Image from 'next/image';
import Link from 'next/link';
import router, { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { ScrollSidebar as SidebarScroll } from '@/components/game/SidebarScroll';
import { SidebarDark as SidebarTablet } from '@/components/game/SidebarTablet';
import MobileSidebarContent from '@/components/MobileSidebarContent';
import { NavLoggedIn } from '@/components/navLoggedIn';
import { NavLoggedOut } from '@/components/navLoggedOut';
import Sidebar from '@/components/Sidebar';
import { useLayout } from '@/context/LayoutContext';
import { AppConfig } from '@/utils/AppConfig';
import { logError } from '@/utils/logger';
import { getAssetPath } from '@/utils/utilities';

import AnnouncementBanner from './AnnouncementBanner';
import ConnectionStatusBanner from './ConnectionStatusBanner';
import MainAreaSkeleton from './MainAreaSkeleton';
import NavSkeleton from './NavSkeleton';
import NewsBulletin from './news-bulletin';
import SidebarSkeleton from './SidebarSkeleton';

const publicFooterLinks = [
  { key: 'home', labelKey: 'loggedOut.home', url: '/' },
  { key: 'howToPlay', labelKey: 'loggedOut.howToPlay', url: '/how-to-play' },
  { key: 'news', labelKey: 'loggedOut.news', url: '/community/news' },
  { key: 'stats', labelKey: 'loggedOut.stats', url: '/community/stats' },
  { key: 'about', labelKey: 'loggedOut.about', url: '/about' },
  {
    key: 'discord',
    labelKey: 'loggedOut.discord',
    url: 'https://discord.gg/j9NYxmBCjA',
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

  const structureReady =
    status === 'authenticated' || status === 'unauthenticated';

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{
        // @ts-ignore
        '--ot-accent': raceClasses?.accent || '#EAAE2B',
        '--ot-surface': 'rgba(10,10,12,0.85)',
        '--ot-surface-2': 'rgba(20,20,24,0.7)',
        '--ot-text': '#FFE87A',
        '--ot-border': 'rgba(255,204,102,0.35)',
      }}
    >
      <div
        className={`w-full grow ${
          authorized ? raceClasses.bgClass : 'bg-elf-header-bgcolor'
        } px-1 text-yellow-400 antialiased`}
      >
        <div className="mx-auto w-full max-w-screen-2xl">
          <header className={`${raceClasses.borderBottomClass}`}>
            <div
              style={{
                backgroundImage: `url('${getAssetPath('wall-header')}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
              className={`${
                authorized ? raceClasses.bgClass : 'bg-elf-header-bgcolor'
              } pb-10 pt-2`}
            >
              <h1 className="title text-center text-4xl font-medium sm:text-5xl md:text-6xl">
                <Image
                  src={`${getAssetPath('OpenThrone')}`}
                  alt={t('app.title')}
                  priority
                  className="mx-auto"
                  style={{
                    height: '100px',
                    width: '200px',
                    filter: 'drop-shadow(0px 3px 0px #000000)',
                  }}
                  width="200"
                  height="100"
                />
              </h1>
              <h2
                className="text-center text-base sm:text-lg md:text-xl"
                style={{ textShadow: '0 -1px' }}
              >
                {AppConfig.description}
              </h2>
            </div>
            {status === 'loading' ? (
              <NavSkeleton />
            ) : authorized ? (
              <NavLoggedIn
                sidebarContent={
                  <MobileSidebarContent isMobile={isMobileSidebar} />
                }
              />
            ) : (
              <NavLoggedOut />
            )}
          </header>
          <main
            className="h-full grow overflow-y-auto px-3 pb-8"
            id="main-content"
            role="main"
            tabIndex={-1}
          >
            <div className="flex h-full flex-wrap lg:flex-nowrap">
              {structureReady ? (
                <>
                  {authorized && !isAdminRoute && (
                    <div
                      className="hidden w-full lg:block lg:w-[260px] lg:pr-4 xl:w-1/5"
                      style={{ backgroundColor: 'var(--ot-surface-2)' }}
                    >
                      {layoutLoading ? (
                        <SidebarSkeleton />
                      ) : router.pathname === '/test' ? (
                        <>
                          <SidebarScroll />
                          <SidebarTablet sidebarData={undefined} />
                        </>
                      ) : (
                        <Sidebar />
                      )}
                    </div>
                      )}
                  <div
                    className={`w-full ${raceClasses.borderClass} ${authorized ? 'lg:flex-1' : 'lg:w-full'} mainArea-bg`}
                  >
                    <ConnectionStatusBanner />
                    <AnnouncementBanner />
                    <NewsBulletin />
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
        </div>
      </footer>
    </div>
  );
};
export default Layout;
