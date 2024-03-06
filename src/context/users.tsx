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
// Updated UserContext with forceUpdate function
const UserContext = createContext<UserContextType>({
  user: null, // Default value for user is null
  forceUpdate: () => {},
  loading: true,
});

export const useUser = () => useContext(UserContext);

const isPublicPath = (path: string | null) => {
  const publicPathsRegex = [
    /^\/account\/login$/,
    /^\/account\/register$/,
    /^\/account\/resetPW$/,
    /^\/account\/resetPW\/result$/,
    /^\/community\/news$/,
    /^\/$/,
    /^\/userprofile\/[a-z0-9]+$/i, // Updated to include letters or numbers
    /^\/recruit\/[a-z0-9]+$/i, // New regex for /recruit/
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
      const response = await fetch(`/api/getUser`);
      if (!response.ok) {
        // Handle HTTP errors
        const errorText = await response.text(); // or response.json() if the server responds with JSON
        alertService.error(`Error fetching user data: ${errorText}`);
        signOut();
        throw new Error('Failed to fetch user data');
      }
      const userData = await response.json();
      setUser(new UserModel(userData));
      if (userData?.beenAttacked) {
        alertService.error(
          'You have been attacked since you were last active!'
        );
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Consider setting an error state here as well
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
  ); // Dependencies array

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
