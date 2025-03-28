import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import UserModel from '@/models/Users';
import { alertService } from '@/services';
import useSocket from '@/hooks/useSocket';
import { fetchWithFallback } from '@/utils/socketFunctions';
import { logError, logInfo } from '@/utils/logger';

interface UserContextType {
  user: UserModel | null;
  forceUpdate: () => void;
  loading: boolean;
  unreadMessages: UnreadMessages[]; // Changed to array
  unreadMessagesCount: number; // Added count
  markMessagesAsRead: (messageId: number) => void;
  markRoomAsRead: (roomId: number) => void;
  // Add function to manually add an unread message if needed
  // addUnreadMessage: (message: UnreadMessages) => void;
}

interface UnreadMessages {
  id: number;
  senderId: number;
  senderName: string;
  content: string; // Message snippet
  timestamp: string;
  isRead: boolean; // Could be useful, though we might just remove from array
  chatRoomId: number;
}

const UserContext = createContext<UserContextType>({
  user: null,
  forceUpdate: () => { },
  loading: true,
  unreadMessages: [],
  unreadMessagesCount: 0, // Initialize count
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
  const [user, setUser] = useState<UserModel | null>(null);
  // Ensure userId is consistently derived and defaults to null
  const userId = useMemo(() => (session?.user?.id ? Number(session.user.id) : null), [session]);
  const {
    socket,
    isConnected,
    addEventListener,
    removeEventListener,
  } = useSocket(userId); // Pass derived userId
  const [loading, setLoading] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState<UnreadMessages[]>([]);
  const WS_ENABLED = process.env.NEXT_PUBLIC_WS_ENABLED === 'true';

  const fetchSessions = useCallback(
    async (uID: number) => {
      logInfo('Fetching user data for', uID);
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

  // Fetch initial unread messages state (optional, depends on persistence needs)
  // useEffect(() => {
  //   if (userId) {
  //     // Fetch initial unread messages from API if needed
  //     // fetch('/api/messages/unread').then(res => res.json()).then(setUnreadMessages);
  //   }
  // }, [userId]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    // --- Socket Event Handlers ---
    const handleUserData = (userData: any) => {
      // ... (handleUserData logic remains the same) ...
      const uModel = new UserModel(userData, false);
      setUser(uModel);

      if (['CLOSED', 'BANNED', 'VACATION', 'SUSPENDED'].includes(userData.currentStatus)) {
        alertService.info(`Your account is currently in ${userData.currentStatus} mode.`, true);
        signOut({ callbackUrl: '/account/login' }); // Redirect after sign out
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
      logError("User Data Error:", error);
      // Only sign out if error implies auth issue, not temporary network error
      if (error?.error?.toLowerCase().includes('unauthorized') || error?.error?.includes('not found')) {
        alertService.error(error?.error || 'Failed to fetch user data. Please log in again.', true);
        signOut({ callbackUrl: '/account/login' });
      } else {
        alertService.error(error?.error || 'Failed to fetch user data.');
      }
      setLoading(false);
    };

    // --- Notification Handlers ---
    const handleNewMessageNotification = (data: UnreadMessages) => {
      logInfo("Received newMessageNotification:", data);
      // Avoid adding duplicate notifications if multiple sockets are open
      setUnreadMessages((prev) => {
        if (prev.some(msg => msg.id === data.id)) {
          return prev; // Already exists
        }
        // Add new message and limit to e.g., 20 recent unread
        return [...prev, { ...data, isRead: false }].slice(-20);
      });
    };

    const handleAttackNotification = (data: { message: string; hash: string }) => {
      // Add simple duplicate check based on hash
      if (!sessionStorage.getItem(data.hash)) {
        alertService.error(data.message);
        sessionStorage.setItem(data.hash, 'true');
        // Optional: remove hash after a while to allow re-notification later
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

    // --- Other Handlers ---
    const handlePong = () => logInfo('Pong received!');
    const handleAlertNotification = (alertData: any) => alertService.success(alertData); // Or other types

    // Attach listeners
    addEventListener('userData', handleUserData);
    addEventListener('userDataError', handleUserDataError);
    addEventListener('pong', handlePong);
    addEventListener('attackNotification', handleAttackNotification);
    addEventListener('friendRequestNotification', handleFriendRequestNotification);
    addEventListener('enemyDeclarationNotification', handleEnemyDeclarationNotification);
    addEventListener('newMessageNotification', handleNewMessageNotification); // Listen for notifications
    addEventListener('alertNotification', handleAlertNotification);

    // Cleanup on unmount or when dependencies change
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
  }, [socket, isConnected, addEventListener, removeEventListener, router]);

  useEffect(() => {
    // Request user data when authenticated and socket is connected
    if (status === 'authenticated' && userId && isConnected) {
      logInfo('User authenticated & socket connected, requesting user data...');
      socket?.emit('requestUserData');
    } else if (status === 'unauthenticated' && !isPublicPath(pathName)) {
      logInfo('User unauthenticated, redirecting to login.');
      router.push('/account/login');
      setUser(null); // Clear user state
      setLoading(false);
    } else if (status !== 'loading') {
      setLoading(false); // Not loading if not authenticated on public path or finished loading
    }
  }, [status, userId, isConnected, socket, pathName, router]); // Add dependencies

  // --- Functions to manage unread messages ---
  const markMessagesAsRead = useCallback((messageId: number) => {
    // This is more complex if persistence is needed. For client-side only:
    setUnreadMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  const markRoomAsRead = useCallback((roomId: number) => {
    // Remove all messages associated with this room ID
    setUnreadMessages((prev) => prev.filter((msg) => msg.chatRoomId !== roomId));
  }, []);

  const unreadMessagesCount = useMemo(() => unreadMessages.length, [unreadMessages]);

  const value = useMemo(
    () => ({
      user,
      forceUpdate: () => {
        if (userId && socket && isConnected) {
          logInfo('forceUpdate triggered: Requesting user data');
          socket.emit('requestUserData'); // Use socket if available
        } else if (userId) {
          logInfo('forceUpdate triggered: Fetching user data via API');
          fetchUserData(userId); // Fallback to API if socket not ready
        }
      },
      loading,
      unreadMessages,
      unreadMessagesCount, // Provide the count
      markMessagesAsRead,
      markRoomAsRead,
    }),
    [user, loading, fetchUserData, userId, socket, isConnected, unreadMessages, unreadMessagesCount, markMessagesAsRead, markRoomAsRead]
  );

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};