import { useRouter } from 'next/router';
import { signOut, useSession } from 'next-auth/react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import UserModel from '@/models/Users';
import { alertService } from '@/services';

// Updated UserContext with forceUpdate function
const UserContext = createContext({
  user: null,
  forceUpdate: () => { },
  loading: true
});

export const useUser = () => useContext(UserContext);

const isPublicPath = (path) => {
  const publicPathsRegex = [
    /^\/account\/login$/,
    /^\/account\/register$/,
    /^\/$/,
    /^\/userprofile\/[a-z0-9]+$/i, // Updated to include letters or numbers
    /^\/recruit\/[a-z0-9]+$/i, // New regex for /recruit/
  ];
  return publicPathsRegex.some((regex) => regex.test(path));
};

export const UserProvider = ({ children }) => {
  const router = useRouter();
  const { data, status } = useSession();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/getUser`);
      if (!response.ok) {
        alertService.error(response.error);
        signOut();
        throw { message: 'Failed to fetch user data', status: response.status };
      }
      const userData = await response.json();
      setUser(new UserModel(userData));
      if (process?.env?.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE && process?.env?.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE !== '')
        alertService.error(process.env.NEXT_PUBLIC_ADMIN_MAINTENANCE_MESSAGE, true);
      if (userData?.beenAttacked) {
        alertService.error('You have been attacked since you were last active!');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Consider setting an error state here as well
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated' && data?.user?.id) {
      fetchUserData(data.user.id);
    }
  }, [data?.user?.id, status]);

  useEffect(() => {
    if (user instanceof UserModel) {
      setUser(user);
    }
  }, [user]);

  useEffect(() => {
    const { asPath } = router;

    if (status !== 'loading') {
      if (!data && !isPublicPath(asPath)) {
        router.replace('/account/login');
      } else if (data && asPath === '/') {
        router.replace('/home/overview');
      }
    }
  }, [data, router, status]);

  // Removed the async useMemo and the interval useEffect
  // Use a dedicated useEffect for recurring updates

  return (
    <UserContext.Provider value={{ user, forceUpdate: () => fetchUserData(data?.user?.id), loading }}>
      {children}
    </UserContext.Provider>
  );
};
