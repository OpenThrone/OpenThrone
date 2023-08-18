import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { NavLoggedIn } from '@/components/navLoggedIn';
import { NavLoggedOut } from '@/components/navLoggedOut';
import Sidebar from '@/components/sidebar';
import { useUser } from '@/context/users';
import { AppConfig } from '@/utils/AppConfig';

interface IMainProps {
  // eslint-disable-next-line react/no-unused-prop-types
  meta: ReactNode;
  children: ReactNode;
}
const Layout = (props: IMainProps) => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { user } = useUser();
  const [authorized, setAuthorized] = useState(status === 'authenticated');
  function authCheck(_url: string) {
    // redirect to login page if accessing a private page and not logged in

    if (status === 'loading') {
      return <div>Loading</div>;
    }
    return setAuthorized(status === 'authenticated');
  }
  function getBgClass(race) {
    switch (race) {
      case 'ELF':
        return 'bg-elf-header-bgcolor';
      case 'HUMAN':
        return 'bg-human-header-bgcolor';
      case 'UNDEAD':
        return 'bg-undead-header-bgcolor';
      case 'GOBLIN':
        return 'bg-goblin-header-bgcolor';
      default:
        return 'bg-elf-header-bgcolor';
    }
  }
  useEffect(() => {
    // on initial load - run auth check
    authCheck(router.asPath);

    // on route change complete - run auth check
    const authCheckHandler = (url: string) => authCheck(url);
    router.events.on('routeChangeComplete', authCheckHandler);

    // unsubscribe from events in useEffect return function
    return () => {
      // router.events.off('routeChangeStart', hideContent);
      router.events.off('routeChangeComplete', authCheckHandler);
    };
  }, [session]);

  return (
    <div className="flex min-h-screen flex-col">
      <div
        className={`w-full grow ${
          authorized ? getBgClass(user?.race) : 'bg-elf-header-bgcolor'
        } px-1 text-yellow-400 antialiased`}
      >
        <div className="mx-auto max-w-screen-xl">
          <header className="mx-auto max-w-screen-xl border-b border-gray-300">
            <div
              className={`${
                authorized ? getBgClass(user?.race) : 'bg-elf-header-bgcolor'
              } pb-10 pt-2`}
            >
              <h1 className="title text-title text-center text-6xl font-medium">
                {AppConfig.title}
              </h1>
              <h2 className="text-center text-xl">{AppConfig.description}</h2>
            </div>
            {authorized ? <NavLoggedIn /> : <NavLoggedOut />}
          </header>

          <main className="container mx-auto h-full grow overflow-y-auto pb-8">
            <div className="flex h-full flex-wrap">
              {authorized ? (
                <>
                  <div className="w-full px-3 sm:w-3/12">
                    <Sidebar />
                  </div>
                  <div className="w-full bg-black px-3 sm:w-9/12">
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
      <footer className="shrink-0 border-t border-gray-300 bg-black py-8 text-center text-sm text-yellow-500">
        © Copyright {new Date().getFullYear()} {AppConfig.title}.
      </footer>
    </div>
  );
};

export default Layout;
