import { useRouter } from 'next/router';
import type { Session } from 'next-auth';
import { getSession } from 'next-auth/react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import UserModel from '@/models/Users';

const UserContext = createContext(null);

export const useUser = () => useContext(UserContext);

const publicPathsRegex = [
  /^\/account\/login$/,
  /^\/account\/register$/,
  /^\/$/,
  /^\/userprofile\/\d+$/,
];

const isPublicPath = (path) =>
  publicPathsRegex.some((regex) => regex.test(path));

export const UserProvider: React.FC = ({ children }) => {
  const [user, setUser] = useState<UserModel | null>(null);
  const [userSession, setUserSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const updateUserData = (session: Session) => {
    if (session && session.player) {
      setUser(new UserModel(session.player));
      setUserSession(session);
    }
  };

  useEffect(() => {
    const fetchUserAndSession = async () => {
      try {
        const session = (await getSession()) as Session;
        updateUserData(session);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching session:', error);
        setLoading(false);
      }
    };

    fetchUserAndSession();
  }, []);

  useEffect(() => {
    const { asPath } = router;

    if (!loading) {
      if (!userSession && !isPublicPath(asPath)) {
        router.replace('/account/login');
      } else if (userSession && asPath === '/') {
        router.replace('/home/overview');
      }
    }
  }, [userSession, router, loading]);

  const refreshUserData = async () => {
    try {
      const session = (await getSession()) as Session;
      updateUserData(session);
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  };

  const player = useMemo(
    () => ({ user, loading, userSession, refreshUserData }),
    [user, loading]
  );

  return <UserContext.Provider value={player}>{children}</UserContext.Provider>;
};
