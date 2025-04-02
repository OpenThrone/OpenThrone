import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import UserModel from '@/models/Users'; // Import UserModel
import { alertService } from '@/services';
import useSocket from '@/hooks/useSocket';
import { fetchWithFallback } from '@/utils/socketFunctions';
import { logError, logInfo, logWarn } from '@/utils/logger';
import type { UserApiResponse, IUserSession } from '@/types/typings'; // Import UserApiResponse
import { users as PrismaUser } from '@prisma/client';

// Define UnreadMessages interface locally or import if moved to typings.d.ts
interface UnreadMessages {
  id: number;
  senderId: number;
  senderName: string;
  content: string; // Message snippet
  timestamp: string; // ISO String date
  isRead: boolean;
  chatRoomId: number;
}

interface UserContextType {
  user: UserModel | null; // Use UserModel here
  forceUpdate: () => void;
  loading: boolean;
  unreadMessages: UnreadMessages[];
  unreadMessagesCount: number;
  markMessagesAsRead: (messageId: number) => void;
  markRoomAsRead: (roomId: number) => void;
}

const UserContext = createContext<UserContextType>({
  user: null,
  forceUpdate: () => { },
  loading: true,
  unreadMessages: [],
  unreadMessagesCount: 0,
  markMessagesAsRead: (messageId: number) => { },
  markRoomAsRead: (roomId: number) => { },
});

export const useUser = () => useContext(UserContext);

const isPublicPath = (path: string | null) => {
  // ... (isPublicPath function remains the same) ...
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
    /^\/battle\/battleSimulator$/, // Added simulator
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
  const [user, setUser] = useState<UserModel | null>(null); // State holds UserModel instance
  const userId = useMemo(() => (session?.user?.id ? Number(session.user.id) : null), [session]);
  const { socket, isConnected, addEventListener, removeEventListener } = useSocket(userId);
  const [loading, setLoading] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState<UnreadMessages[]>([]);
  const WS_ENABLED = process.env.NEXT_PUBLIC_WS_ENABLED === 'true';

  const processAndSetUserData = useCallback((userData: UserApiResponse | PrismaUser) => {
    try {
      // Ensure necessary fields exist before creating UserModel
      if (!userData || typeof userData.id !== 'number') {
        logError("Received invalid user data structure:", userData);
        throw new Error("Invalid user data received");
      }
      const uModel = new UserModel(userData as PrismaUser, false); // Cast to PrismaUser
      setUser(uModel);

      if (['CLOSED', 'BANNED', 'VACATION', 'SUSPENDED'].includes(userData.currentStatus)) {
        alertService.info(`Your account is currently in ${userData.currentStatus} mode.`, true);
        signOut({ callbackUrl: '/account/login' });
        return false; // Indicate failure/redirect
      }

      if ((userData as UserApiResponse).beenAttacked) {
        alertService.error('You have been attacked since you were last active!');
      }
      if ((userData as UserApiResponse).detectedSpy) {
        alertService.error('You have detected a Spy attempt since you were last active!');
      }
      return true; // Indicate success
    } catch (error) {
      logError("Error processing user data:", error, userData);
      // Handle specific error cases if needed
      alertService.error("Failed to process user data.");
      return false; // Indicate failure
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUserData = useCallback(
    async (uID: number) => {
      setLoading(true); // Set loading true at the start of fetch
      await fetchWithFallback(
        socket,
        isConnected,
        'requestUserData', // WebSocket event
        '/api/general/getUser', // Fallback API URL
        { userId: uID },
        (data: UserApiResponse | PrismaUser) => { // Expect raw data here
          processAndSetUserData(data);
        },
        () => { } // Let processAndSetUserData handle final loading state
      );
    },
    [socket, isConnected] // processAndSetUserData is stable if defined outside or memoized
  );


  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleUserData = (userData: UserApiResponse | PrismaUser) => { // Expect raw data
      logInfo("Socket received userData:", userData.id);
      processAndSetUserData(userData);
    };

    const handleUserDataError = (error: any) => {
      logError("User Data Error from Socket:", error);
      if (error?.error?.toLowerCase().includes('unauthorized') || error?.error?.includes('not found')) {
        alertService.error(error?.error || 'Session invalid. Please log in again.', true);
        signOut({ callbackUrl: '/account/login' });
      } else {
        alertService.error(error?.error || 'Failed to fetch user data via WebSocket.');
      }
      setUser(null); // Clear user on significant error
      setLoading(false);
    };

    // --- Notification Handlers ---
    const handleNewMessageNotification = (data: UnreadMessages) => {
      logInfo("Received newMessageNotification:", data);
      setUnreadMessages((prev) => {
        if (prev.some(msg => msg.id === data.id)) return prev;
        return [...prev, { ...data, isRead: false }].slice(-20);
      });
    };
    // ... other notification handlers (handleAttackNotification, etc.) remain the same ...
    const handleAttackNotification = (data: { message: string; hash: string }) => {
      if (!sessionStorage.getItem(data.hash)) {
        alertService.error(data.message);
        sessionStorage.setItem(data.hash, 'true');
        setTimeout(() => sessionStorage.removeItem(data.hash), 60000);
      }
    };
    const handleFriendRequestNotification = (data: { message: string; hash: string }) => {
      if (!sessionStorage.getItem(data.hash)) {
        alertService.success(data.message);
        sessionStorage.setItem(data.hash, 'true');
        setTimeout(() => sessionStorage.removeItem(data.hash), 60000);
      }
    };
    const handleEnemyDeclarationNotification = (data: { message: string; hash: string }) => {
      if (!sessionStorage.getItem(data.hash)) {
        alertService.error(data.message);
        sessionStorage.setItem(data.hash, 'true');
        setTimeout(() => sessionStorage.removeItem(data.hash), 60000);
      }
    };
    const handlePong = () => logInfo('Pong received!');
    const handleAlertNotification = (alertData: any) => alertService.success(alertData); // Or other types


    addEventListener('userData', handleUserData);
    addEventListener('userDataError', handleUserDataError);
    addEventListener('pong', handlePong);
    addEventListener('attackNotification', handleAttackNotification);
    addEventListener('friendRequestNotification', handleFriendRequestNotification);
    addEventListener('enemyDeclarationNotification', handleEnemyDeclarationNotification);
    addEventListener('newMessageNotification', handleNewMessageNotification);
    addEventListener('alertNotification', handleAlertNotification);

    return () => {
      removeEventListener('userData', handleUserData);
      removeEventListener('userDataError', handleUserDataError);
      removeEventListener('pong', handlePong);
      removeEventListener('attackNotification', handleAttackNotification);
      removeEventListener('friendRequestNotification', handleFriendRequestNotification);
      removeEventListener('enemyDeclarationNotification', handleEnemyDeclarationNotification);
      removeEventListener('newMessageNotification', handleNewMessageNotification);
      removeEventListener('alertNotification', handleAlertNotification);
    };
  }, [socket, isConnected, addEventListener, removeEventListener, processAndSetUserData]); // Added processAndSetUserData dependency

  useEffect(() => {
    if (status === 'authenticated' && userId && (isConnected || !WS_ENABLED)) { // Check WS_ENABLED flag
      logInfo(`User authenticated. WS_ENABLED: ${WS_ENABLED}, isConnected: ${isConnected}. Requesting user data...`);
      if (isConnected && WS_ENABLED) {
        socket?.emit('requestUserData');
      } else if (!WS_ENABLED) {
        fetchUserData(userId); // Use API fallback if WS disabled
      } else {
        // If WS is enabled but not connected yet, wait for connection or fetch after timeout?
        // For now, let's rely on the socket connection logic to eventually trigger the request.
        // Or, trigger fetchUserData immediately as fallback if connection is slow:
        // fetchUserData(userId);
      }
    } else if (status === 'unauthenticated' && !isPublicPath(pathName)) {
      logInfo('User unauthenticated on private path, redirecting to login.');
      router.push('/account/login');
      setUser(null);
      setLoading(false);
    } else if (status !== 'loading') {
      setLoading(false);
    }
  }, [status, userId, isConnected, socket, pathName, router, fetchUserData, WS_ENABLED]); // Added WS_ENABLED


  // --- Functions to manage unread messages ---
  const markMessagesAsRead = useCallback((messageId: number) => {
    setUnreadMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  const markRoomAsRead = useCallback((roomId: number) => {
    setUnreadMessages((prev) => prev.filter((msg) => msg.chatRoomId !== roomId));
  }, []);

  const unreadMessagesCount = useMemo(() => unreadMessages.length, [unreadMessages]);

  const value = useMemo(
    () => ({
      user, // This is the UserModel instance
      forceUpdate: () => {
        if (userId) { // Check if userId is valid
          logInfo('forceUpdate triggered');
          if (socket && isConnected && WS_ENABLED) { // Check WS_ENABLED flag
            logInfo('forceUpdate: Requesting user data via WebSocket');
            socket.emit('requestUserData');
          } else {
            logInfo('forceUpdate: Fetching user data via API');
            fetchUserData(userId); // Use API if socket not ready or WS disabled
          }
        } else {
          logWarn('forceUpdate called without a valid userId.');
        }
      },
      loading,
      unreadMessages,
      unreadMessagesCount,
      markMessagesAsRead,
      markRoomAsRead,
    }),
    [user, loading, fetchUserData, userId, socket, isConnected, unreadMessages, unreadMessagesCount, markMessagesAsRead, markRoomAsRead, WS_ENABLED] // Added WS_ENABLED
  );


  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};
