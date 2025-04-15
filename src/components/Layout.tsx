import { useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { NavLoggedIn } from '@/components/navLoggedIn';
import { NavLoggedOut } from '@/components/navLoggedOut';
import Sidebar from '@/components/Sidebar';
import { useLayout } from '@/context/LayoutContext';
import { AppConfig } from '@/utils/AppConfig';
import { getAssetPath } from '@/utils/utilities';
import Image from 'next/image';
import NewsBulletin from './news-bulletin';
import { logError } from '@/utils/logger';
import NavSkeleton from './NavSkeleton';
import MainAreaSkeleton from './MainAreaSkeleton';
import SidebarSkeleton from './SidebarSkeleton';
import { useUser } from '@/context/users';

interface IMainProps {
  children: ReactNode;
}

const Layout = (props: IMainProps) => {
  const { status } = useSession();
  const { raceClasses, authorized, userLoading: layoutLoading } = useLayout();
  const [gitInfo, setGitInfo] = useState({ latestCommit: '', latestCommitMessage: '' });
  const [onlinePlayerInfo, setOnlinePlayerInfo] = useState({ onlinePlayers: 0, totalPlayers: 0, newestPlayer: '', newPlayers: 0 });
  const [isDevelopment, setIsDevelopment] = useState(false);
  const { user } = useUser();

  useEffect(() => {
    setIsDevelopment(process.env.NODE_ENV === 'development');
  }, []);

  useEffect(() => {
    if (isDevelopment) {
      fetch('/api/general/git-info')
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch git info');
          }
          return response.json();
        })
        .then(data => {
          setGitInfo(data);
        })
        .catch(error => {
          logError('Failed to fetch git info:', error);
        });
    } else {
      fetch('/api/general/getOnlinePlayers')
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch online player info');
          }
          return response.json();
        })
        .then(data => {
          setOnlinePlayerInfo({
            onlinePlayers: data.onlineUsers,
            totalPlayers: data.allUsersCounted,
            newestPlayer: data.newestUser,
            newPlayers: data.newUsers,
          });
        })
        .catch(error => {
          logError('Failed to fetch online player info:', error);
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
    <div className="flex min-h-screen flex-col">
      <div
        className={`w-full grow ${authorized ? raceClasses.bgClass : 'bg-elf-header-bgcolor'
          } px-1 text-yellow-400 antialiased`}>
        <div className="mx-auto max-w-screen-2xl">
          <header
            className={`mx-auto ${raceClasses.borderBottomClass}`}
          >
            <div
              style={{ backgroundImage: `url('${getAssetPath('wall-header')}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
              className={`${authorized
                  ? raceClasses.bgClass
                  : 'bg-elf-header-bgcolor'
                } pb-10 pt-2`}
            >
              <h1 className="title text-title text-center text-6xl font-medium">
                <center>
                  <Image
                    src={`${getAssetPath('OpenThrone')}`}
                    alt="OpenThrone"
                    style={{ height: '150px', filter: 'drop-shadow(0px 3px 0px #000000)' }}
                    width={'300'}
                    height={'150'}
                  />
                </center>
              </h1>
              <h2 className="text-center text-xl" style={{ textShadow: '0 -1px' }}>{AppConfig.description}</h2>
            </div>
            {status === 'loading' ? (
              <NavSkeleton />
            ) : authorized ? (
              <NavLoggedIn />
            ) : (
              <NavLoggedOut />
            )}
          </header>

          <main className="lg:container mx-auto h-full grow overflow-y-auto pb-8">
            <div className="flex h-full flex-wrap">
              {structureReady ? (
                <>
                  {/* Conditionally render Sidebar based on authentication status */}
                  {status === 'authenticated' && (
                    <div className="w-full px-3 md:w-1/5" style={{ backgroundColor: 'rgba(0,0,0,.5)' }}>
                      {layoutLoading ? <SidebarSkeleton /> : <Sidebar />}
                    </div>
                  )}
                  {/* Adjust main content width based on authentication status */}
                  <div className={`w-full bg-black ${raceClasses.borderClass} px-3 ${status === 'authenticated' ? 'md:w-4/5' : 'md:w-full'}`}>
                    <NewsBulletin />
                    {layoutLoading ? <MainAreaSkeleton /> : props.children}
                  </div>
                </>
              ) : (
                // Show a minimal placeholder while structure is deciding
                <div className="w-full bg-black px-3">
                  <MainAreaSkeleton /> {/* Or a very minimal, full-width placeholder */}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
      <footer className="shrink-0 border-t border-gray-300 bg-black py-3 text-center text-sm text-yellow-500">
        © Copyright {new Date().getFullYear()} {AppConfig.title}.
        <br />
        <div className="text-xs">
          {isDevelopment ? (
            <>
              <p><strong>Latest Commit:</strong> {gitInfo.latestCommit}</p>
              <p><strong>Latest Commit Message:</strong> {gitInfo.latestCommitMessage}</p>
            </>
          ) : (
            <>
              <p><strong>Online Players:</strong> {onlinePlayerInfo.onlinePlayers} / {onlinePlayerInfo.totalPlayers}</p>
              <p><strong>New Players in last 24hrs:</strong> {onlinePlayerInfo.newPlayers}</p>
              <p><strong>Newest Player:</strong> {onlinePlayerInfo.newestPlayer}</p>
            </>
          )}

        </div>
      </footer>
    </div>
  );
};

export default Layout;