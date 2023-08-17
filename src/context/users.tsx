import Error from 'next/error';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import UserModel from '@/models/Users';

// Updated UserContext with forceUpdate function
const UserContext = createContext({
  user: null,
  forceUpdate: () => {},
});

export const useUser = () => useContext(UserContext);

const isPublicPath = (path) => {
  const publicPathsRegex = [
    /^\/account\/login$/,
    /^\/account\/register$/,
    /^\/$/,
    /^\/userprofile\/\d+$/,
  ];
  return publicPathsRegex.some((regex) => regex.test(path));
};

export const UserProvider: React.FC = ({ children }) => {
  const router = useRouter();
  const { data, status } = useSession();

  const [user, setUser] = useState(null);

  const fetchUserDataFromAPI = async () => {
    const response = await fetch(`/api/getUser`);
    if (!response.ok) {
      throw new Error('Failed to fetch user data');
    }
    return response.json();
  };
  // Function to fetch user data
  const fetchUserData = async (): Promise<void> => {
    try {
      if (data?.player?.id) {
        const updatedUserData = await fetchUserDataFromAPI();
        setUser(new UserModel(updatedUserData));
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  useEffect(() => {
    const { asPath } = router;

    if (!(status === 'loading')) {
      if (!data && !isPublicPath(asPath)) {
        router.replace('/account/login');
      } else if (data && asPath === '/') {
        router.replace('/home/overview');
      }
    }
  }, [data, router, status]);

  useEffect(() => {
    const interval = setInterval(fetchUserData, 30000);

    return () => clearInterval(interval);
  }, []);

  const player = useMemo(async () => {
    const updatedUserData = await fetchUserDataFromAPI(data.player.id);
    setUser(new UserModel(updatedUserData));

    return { user, loading: status === 'loading', userSession: data };
  }, [data, status]);

  return (
    <UserContext.Provider value={{ user, forceUpdate: fetchUserData }}>
      {children}
    </UserContext.Provider>
  );
};
