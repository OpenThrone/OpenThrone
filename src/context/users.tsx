import { useRouter } from 'next/router';
import type { Session } from 'next-auth';
import { getSession } from 'next-auth/react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import UserModel from '@/models/Users';

const UserContext = createContext(null);
export const useUser = () => {
  return useContext(UserContext);
};

export const UserProvider: React.FC = ({ children }) => {
  const [user, setUser] = useState<UserModel | null>(null);
  const [userSession, setUserSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Fetch user data on component mount only
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const session = (await getSession()) as Session;
        if (session && session.player) {
          setUser(new UserModel(session.player));
          setUserSession(session);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching session:', error);
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  useEffect(() => {
    const { asPath } = router;
    const publicPaths = [
      '/account/login/',
      '/account/register/',
      '/',
      '/userprofile/[id]',
    ];

    // Check if the current path matches any of the whitelisted public paths
    const isPublicPath = publicPaths.some((path) => {
      const regex = new RegExp(`^${path.replace('[id]', '\\d+')}$`);
      return regex.test(asPath);
    });
    if (!loading) {
      if (!userSession && !isPublicPath) {
        console.log('redirecting to login');
        router.replace('/account/login');
      } else if (userSession && asPath === '/') {
        router.replace('/home/overview');
      }
    }
  }, [userSession, router, loading]);

  const player = useMemo(
    () => ({ user, loading, userSession }),
    [user, loading]
  );

  return <UserContext.Provider value={player}>{children}</UserContext.Provider>;
};
