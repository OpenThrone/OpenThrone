import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import UserModel from '@/models/Users';
import { alertService } from '@/services';
import useSocket from '@/hooks/useSocket';
import { fetchWithFallback } from '@/utils/socketFunctions';

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
  const { data: session, status } = useSession();
  const [user, setUser] = useState<UserModel | null>(null);
  const userId = user?.id || session?.user?.id || null;
  const {
    socket,
    isConnected,
    addEventListener,
    removeEventListener,
  } = useSocket(userId); 
  const [loading, setLoading] = useState(true);
  const WS_ENABLED = process.env.NEXT_PUBLIC_WS_ENABLED === 'true';

  const fetchSessions = useCallback(
    async (uID: number) => {
      console.log('Fetching user data for', uID);
      await fetchWithFallback(
        socket,
        isConnected,
        'listRecruitingSessions',
        '/api/recruit/listSessions',
        { userId: uID },
        (userData) => setUser(new UserModel(userData, false)),
        setLoading
      );
    },
    [socket, isConnected]
  );

  const fetchUserData = useCallback(
    async (uID: number) => {
      await fetchWithFallback(
        socket,
        isConnected,
        'requestUserData',
        '/api/general/getUser',
        { userId: uID },
        (userData) => setUser(new UserModel(userData, false)),
        setLoading
      );
    },
    [socket, isConnected]
  );

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Define handlers for socketIO
    const handleUserData = (userData: any) => {
      const uModel = new UserModel(userData, false);
      setUser(uModel);

      if (['CLOSED', 'BANNED', 'VACATION'].includes(userData.currentStatus)) {
        alertService.info(`Your account is currently in ${userData.currentStatus} mode.`, true);
        signOut();
        router.push('/account/login');
        return;
      }

      if (userData?.beenAttacked) {
        alertService.error('You have been attacked since you were last active!');
      }
      if (userData?.detectedSpy) {
        alertService.error('You have detected a Spy attempt since you were last active!');
      }

      setLoading(false);
    };

    const handleUserDataError = (error: any) => {
      alertService.error(error || 'Failed to fetch user data.');
      setLoading(false);
    };

    const handlePong = () => {
      console.log('Pong!');
      alert('Pong!');
    };
    
    const handleAttackNotification = (data: any) => {
      alertService.error(data.message); // TODO: change this to actually implement a message notification
    };

    const handleFriendRequestNotification = (data: any) => {
      alertService.success(data.message);// TODO: change this to actually implement a message notification
    };

    const handleEnemyDeclarationNotification = (data: any) => {
      alertService.error(data.message);// TODO: change this to actually implement a message notification
    };

    const handleMessageNotification = (data: any) => {
      alertService.success(data.message); // TODO: change this to actually implement a message notification
    };

    const handleAlertNotification = (alertData: any) => {
      alertService.success(alertData);
    };

    /* 
    TODO: remove comments
      need to add a const for the function
      add to an eventlistener
      remember to remove the event listener

      server needs to act like router for the socket
      will need to refactor this later, but the user context seems fitting

      client __ server
      userData == requestUserData
      pong == ping
      notifyAttack == attackNotification
      ?? == notifyFriendRequest
    */

    // Attach listeners
    addEventListener('userData', handleUserData);
    addEventListener('userDataError', handleUserDataError);
    addEventListener('pong', handlePong);
    addEventListener('attackNotification', handleAttackNotification);
    addEventListener('friendRequestNotification', handleFriendRequestNotification);
    addEventListener('enemyDeclarationNotification', handleEnemyDeclarationNotification);
    addEventListener('messageNotification', handleMessageNotification);
    addEventListener('alertNotification', handleAlertNotification);

    // Cleanup on unmount or when dependencies change
    return () => {
      removeEventListener('userData', handleUserData);
      removeEventListener('userDataError', handleUserDataError);
      removeEventListener('pong', handlePong);
      removeEventListener('attackNotification', handleAttackNotification);
      removeEventListener('friendRequestNotification', handleFriendRequestNotification);
      removeEventListener('enemyDeclarationNotification', handleEnemyDeclarationNotification);
      removeEventListener('messageNotification', handleMessageNotification);
      removeEventListener('alertNotification', handleAlertNotification);
    };
  }, [socket, isConnected, addEventListener, removeEventListener, router]); 

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      console.log('Session authenticated; fetching user data');
      fetchUserData(session.user.id);
    }
  }, [status, session, isConnected, fetchUserData]);

  useEffect(() => {
    if (pathName && router) {
      if (status !== 'loading') {
        if (!session && !isPublicPath(pathName)) {
          router.push('/account/login');
        } else if (session && pathName === '/') {
          router.push('/home/overview');
        }
      }
    }
  }, [session, pathName, status, router]);

  const value = useMemo(
    () => ({
      user,
      forceUpdate: () => {
        if (session?.user?.id) {
          fetchUserData(session.user.id);
        }
      },
      loading,
    }),
    [user, loading, fetchUserData, session]
  );

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};
