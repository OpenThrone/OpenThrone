import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import UserModel from '@/models/Users';
import { alertService } from '@/services';

interface UserContextType {
  user: UserModel | null;
  forceUpdate: () => void;
  loading: boolean;
}

const UserContext = createContext<UserContextType>({
  user: null,
  forceUpdate: () => { },
  loading: true,
});

export const useUser = () => useContext(UserContext);

const isPublicPath = (path: string | null) => {
  const publicPathsRegex = [
    /^\/account\/login$/,
    /^\/account\/register$/,
    /^\/account\/password-reset$/,
    /^\/account\/password-reset\/result$/,
    /^\/account\/password-reset\/verify$/,
    /^\/community\/news$/,
    /^\/$/,
    /^\/userprofile\/[a-z0-9]+$/i,
    /^\/recruit\/[a-z0-9]+$/i,
    /^\/auto-recruit$/,
  ];
  if (path === null) return false;
  return publicPathsRegex.some((regex) => regex.test(path));
};

interface UsersProviderProps {
  children: ReactNode;
}

export const UserProvider: React.FC<UsersProviderProps> = ({ children }) => {
  const router = useRouter();
  const pathName = usePathname();

  const { data, status } = useSession();
  const [user, setUser] = useState<UserModel | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/general/getUser`);
      if (!response.ok) {
        const errorText = await response.text();
        alertService.error(`Error fetching user data: ${errorText}`);
        signOut();
        throw new Error('Failed to fetch user data');
      }
      const userData = await response.json();
      const uModel = new UserModel(userData, false);
      setUser(uModel);

      // Check for status that requires sign-out
      if (['CLOSED', 'BANNED', 'VACATION'].includes(userData.status)) {
        alertService.info(`Your account is currently in ${userData.status} mode.`, true);
        await signOut();
        await router.push('/account/login');
        return; // Prevent further execution if signed out
      }

      // Alerts for beenAttacked and detectedSpy
      if (userData?.beenAttacked) {
        alertService.error('You have been attacked since you were last active!');
      }
      if (userData?.detectedSpy) {
        alertService.error('You have detected a Spy attempt since you were last active!');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      fetchUserData();
    }
  }, [status]);

  useEffect(() => {
    if (user instanceof UserModel) {
      setUser(user);
    }
  }, [user]);

  useEffect(() => {
    if (pathName) {
      if (router) {
        if (status !== 'loading') {
          if (!data && !isPublicPath(pathName)) {
            router.push('/account/login');
          } else if (data && pathName === '/') {
            router.push('/home/overview');
          }
        }
      }
    }
  }, [data, pathName, status, router]);

  const value = useMemo(
    () => ({
      user,
      forceUpdate: () => fetchUserData(),
      loading,
    }),
    [user, loading]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
