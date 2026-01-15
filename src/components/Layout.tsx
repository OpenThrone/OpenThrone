import { useMediaQuery } from '@mantine/hooks';
import Image from 'next/image';
import router from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import SidebarScroll from '@/components/game/SidebarScroll';
import { SidebarDark as SidebarTablet } from '@/components/game/SidebarTablet';
import MobileSidebarContent from '@/components/MobileSidebarContent'; // Import MobileSidebarContent
import { NavLoggedIn } from '@/components/navLoggedIn';
import { NavLoggedOut } from '@/components/navLoggedOut';
import Sidebar from '@/components/Sidebar';
import { useLayout } from '@/context/LayoutContext';
// Renamed import to avoid conflict
import { AppConfig } from '@/utils/AppConfig';
import { logError } from '@/utils/logger';
import { getAssetPath } from '@/utils/utilities';

import MainAreaSkeleton from './MainAreaSkeleton';
import NavSkeleton from './NavSkeleton';
import NewsBulletin from './news-bulletin';
import SidebarSkeleton from './SidebarSkeleton';

interface IMainProps {
  children: ReactNode;
}

const Layout = (props: IMainProps) => {
  const { t } = useTranslation('common');
  const { status } = useSession();
  const { raceClasses, authorized, userLoading: layoutLoading } = useLayout();
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
  const [isDevelopment, setIsDevelopment] = useState(false);

  useEffect(() => {
    setIsDevelopment(process.env.NODE_ENV === 'development');
  }, []);

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

  const [structureReady, setStructureReady] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' || status === 'unauthenticated') {
      setStructureReady(true); // Structure is ready as soon as authentication state is known
    }
  }, [status]);

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
        {' '}
        {/* Added missing closing div tag here */}
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
                <center>
                  <Image
                    src={`${getAssetPath('OpenThrone')}`}
                    alt={t('app.title')}
                    priority
                    style={{
                      height: '100px',
                      width: '200px',
                      filter: 'drop-shadow(0px 3px 0px #000000)',
                    }}
                    width="200"
                    height="100"
                  />
                </center>
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
                  {/* Conditionally render Sidebar based on authentication status */}
                  {authorized && (
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
                  {/* Adjust main content width based on authentication status */}
                  <div
                    className={`w-full ${raceClasses.borderClass} ${authorized ? 'lg:flex-1' : 'lg:w-full'} mainArea-bg`}
                  >
                    <NewsBulletin />
                    {layoutLoading ? <MainAreaSkeleton /> : props.children}
                  </div>
                </>
              ) : (
                // Show a minimal placeholder while structure is deciding
                <div
                  className="w-full"
                  style={{ backgroundColor: 'var(--ot-surface)' }}
                >
                  <MainAreaSkeleton />{' '}
                  {/* Or a very minimal, full-width placeholder */}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>{' '}
      {/* Closing div for the w-full grow div */}
      <footer className="shrink-0 border-t border-gray-300 bg-black py-3 text-center text-sm text-[var(--ot-text)]">
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
