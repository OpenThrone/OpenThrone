import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { NavLoggedIn } from '@/components/navLoggedIn';
import { NavLoggedOut } from '@/components/navLoggedOut';
import Sidebar from '@/components/sidebar';
import { useLayout } from '@/context/LayoutContext';
import { AppConfig } from '@/utils/AppConfig';
import { getAssetPath } from '@/utils/utilities';
import Image from 'next/image';
import NewsBulletin from './news-bulletin';

interface IMainProps {
  // eslint-disable-next-line react/no-unused-prop-types
  // meta: ReactNode;
  children: ReactNode;
}
const Layout = (props: IMainProps) => {
  const { data: session, status } = useSession();
  const [authorized, setAuthorized] = useState(status === 'authenticated');
  const layoutCont = useLayout();
  const pathName = usePathname();
  const [gitInfo, setGitInfo] = useState({ latestCommit: '', latestCommitMessage: '' });
  const [loading, setLoading] = useState(true);
  const [onlinePlayerInfo, setOnlinePlayerInfo] = useState({ onlinePlayers: 0, totalPlayers: 0, newestPlayer:'', newPlayers: 0 });
  const [isDevelopment, setIsDevelopment] = useState(false);

  useEffect(() => {
    setIsDevelopment(process.env.NODE_ENV === 'development');
  }, []);

  useEffect(() => {
    function authCheck(_url: string | null) {
      // redirect to login page if accessing a private page and not logged in

      if (status === 'loading') {
        return <div>Loading</div>;
      }
      return setAuthorized(status === 'authenticated');
    }
    authCheck(pathName);
  }, [session, pathName, status]);

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
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to fetch git info:', error);
          setLoading(false);
        });
    }
  }, [isDevelopment]);

  useEffect(() => {
    if (!isDevelopment) {
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
          console.error('Failed to fetch online player info:', error);
        });
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <div
        className={`w-full grow ${
          authorized ? layoutCont.raceClasses.bgClass : 'bg-elf-header-bgcolor'
          } px-1 text-yellow-400 antialiased`}>
        <div className="mx-auto max-w-screen-2xl">
          <header
            className={`mx-auto ${layoutCont.raceClasses.borderBottomClass}`}
          >
            <div
              style={{ backgroundImage: `url('${getAssetPath('Elf-wall-header')}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat'}}
              className={`${
                authorized
                  ? layoutCont.raceClasses.bgClass
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
              <h2 className="text-center text-xl" style={{textShadow: '0 -1px'}}>{AppConfig.description}</h2>
            </div>
            {authorized ? <NavLoggedIn /> : <NavLoggedOut />}
          </header>

          <main className="container mx-auto h-full grow overflow-y-auto pb-8">
            <div className="flex h-full flex-wrap">
              {authorized ? (
                <>
                  <div className="w-full px-3 sm:w-1/5" style={{backgroundColor: 'rgba(0,0,0,.5)'}}>
                    <Sidebar />
                  </div>
                  <div
                    className={`w-full bg-black ${layoutCont.raceClasses.borderClass} px-3 sm:w-4/5`}
                  >
                    <NewsBulletin />
                    {props.children}
                  </div>
                </>
              ) : (
                <div className="w-full bg-black px-3">{props.children}</div>
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
