import { useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { NavLoggedIn } from '@/components/navLoggedIn';
import { NavLoggedOut } from '@/components/navLoggedOut';
import Sidebar from '@/components/Sidebar';
import MobileNavigation from '@/components/MobileNavigation'; // Import MobileNavigation
import MobileSidebarContent from '@/components/MobileSidebarContent'; // Import MobileSidebarContent
import { useLayout } from '@/context/LayoutContext';
import { AppConfig } from '@/utils/AppConfig';
import { getAssetPath } from '@/utils/utilities';
import Image from 'next/image';
import NewsBulletin from './news-bulletin';
import { logError } from '@/utils/logger';
import NavSkeleton from './NavSkeleton';
import MainAreaSkeleton from './MainAreaSkeleton';
import getGitInfoApi from '@/pages/api/general/git-info'; // Renamed import to avoid conflict
import SidebarSkeleton from './SidebarSkeleton';

interface IMainProps {
  children: ReactNode;
}

const Layout = (props: IMainProps) => {
  const { status } = useSession();
  const { raceClasses, authorized, userLoading: layoutLoading } = useLayout();
  const [gitInfo, setGitInfo] = useState({ latestCommit: '', latestCommitMessage: '' });
  const [onlinePlayerInfo, setOnlinePlayerInfo] = useState({ onlinePlayers: 0, totalPlayers: 0, newestPlayer: '', newPlayers: 0 });
  const [isDevelopment, setIsDevelopment] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // State for mobile menu

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
    <>
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
          className={`w-full grow ${authorized ? raceClasses.bgClass : 'bg-elf-header-bgcolor'
            } px-1 text-yellow-400 antialiased`}
        > {/* Added missing closing div tag here */}
          <div className="mx-auto w-full max-w-screen-2xl">
            <header className={`${raceClasses.borderBottomClass}`}>
              <div
                style={{ backgroundImage: `url('${getAssetPath('wall-header')}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
                className={`${authorized
                  ? raceClasses.bgClass
                  : 'bg-elf-header-bgcolor'
                } pb-10 pt-2`}
              >
                <h1 className="title text-title text-center text-4xl sm:text-5xl md:text-6xl font-medium">
                  <center>
                    <Image
                      src={`${getAssetPath('OpenThrone')}`}
                      alt="OpenThrone"
                      priority
                      style={{ height: '100px', width: '200px', filter: 'drop-shadow(0px 3px 0px #000000)' }}
                      width={'200'}
                      height={'100'}
                    />
                  </center>
                </h1>
                <h2 className="text-center text-base sm:text-lg md:text-xl" style={{ textShadow: '0 -1px' }}>{AppConfig.description}</h2>
              </div>
              {status === 'loading' ? (
                <NavSkeleton />
              ) : authorized ? (
                <NavLoggedIn />
              ) : (
                <NavLoggedOut />
              )}
              {/* Mobile Navigation Toggle Button */}
              <div className="lg:hidden flex justify-end p-2">
                <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="text-ot-text focus:outline-none"
                  aria-label="Open mobile menu"
                >
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 6h16M4 12h16M4 18h16"
                    ></path>
                  </svg>
                </button>
              </div>
            </header>
            <main className="h-full grow overflow-y-auto pb-8 px-3" style={{ backgroundImage: `url('${getAssetPath('wall-body')}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
              <div className="flex h-full flex-wrap" style={{ background: 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5))' }}>
                {structureReady ? (
                  <>
                    {/* Conditionally render Sidebar based on authentication status */}
                    {authorized && (
                      <div className="w-full lg:w-1/5" style={{ backgroundColor: 'var(--ot-surface-2)' }}>
                        {layoutLoading ? <SidebarSkeleton /> : <Sidebar />}
                      </div>
                    )}
                    {/* Adjust main content width based on authentication status */}
                    <div className={`w-full ${raceClasses.borderClass} ${authorized ? 'lg:w-4/5' : 'lg:w-full'}`} style={{ backgroundColor: 'var(--ot-surface)' }}>
                      <NewsBulletin />
                      {layoutLoading ? <MainAreaSkeleton /> : props.children}
                    </div>
                  </>
                ) : (
                  // Show a minimal placeholder while structure is deciding
                  <div className="w-full" style={{ backgroundColor: 'var(--ot-surface)' }}>
                    <MainAreaSkeleton /> {/* Or a very minimal, full-width placeholder */}
                  </div>
                )}
              </div>
            </main>
          </div>
        </div> {/* Closing div for the w-full grow div */}
        <footer className="shrink-0 border-t border-gray-300 bg-black py-3 text-center text-sm text-ot-text">
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
      {/* Render MobileNavigation */}
      {authorized && (
        <MobileNavigation
          open={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          menuItems={[]} // Define your mobile menu items here
          sidebarContent={<MobileSidebarContent isMobile={true} />} // Pass the new component here
        />
      )}
    </>
  );
};
export default Layout;
