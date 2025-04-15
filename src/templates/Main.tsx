/* eslint-disable jsx-a11y/anchor-is-valid */
import { useSearchParams } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { NavLoggedIn } from '@/components/navLoggedIn';
import { NavLoggedOut } from '@/components/navLoggedOut';
import Sidebar from '@/components/Sidebar';
import { AppConfig } from '@/utils/AppConfig';

interface IMainProps {
  meta: ReactNode;
  children: ReactNode;
}

const Main = (props: IMainProps) => {
  const [authorized, setAuthorized] = useState<boolean>(false);
  const { data: session, status } = useSession();
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const authCheck = useCallback((url: string | null) => {
    // redirect to login page if accessing a private page and not logged in

    if (status === 'loading') {
      return <div>Loading</div>;
    }
    if (!session) {
      setAuthorized(false);
    } else {
      setAuthorized(true);
    }
    return true;
  }, [status, session]);
  useEffect(() => {
      authCheck(pathname);
    
  }, [session, pathname, searchParams, authCheck]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="w-full grow bg-elf-header-bgcolor px-1 text-yellow-400 antialiased">
        {props.meta}

        <div className="mx-auto max-w-screen-xl">
          <header className="mx-auto max-w-screen-xl border-b border-gray-300">
            <div className="bg-elf-header-bgcolor pb-10 pt-2">
              <h1 className="title text-center text-6xl font-medium text-title">
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

export { Main };
