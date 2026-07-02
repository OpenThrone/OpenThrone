import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import useSocket from '@/hooks/useSocket';
import type { users as PrismaUser } from '@/lib/prisma-exports';
import UserModel from '@/models/Users'; // Import UserModel
import { alertService } from '@/services/Alert.service';
import type { UserApiResponse } from '@/types/typings';
import { stringifyObj } from '@/utils/jsonHelpers';
import { logDebug, logError, logInfo, logWarn } from '@/utils/logger';

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
  markMessagesAsRead: (_messageId: number) => void;
  markRoomAsRead: (_roomId: number) => void;
}

const UserContext = createContext<UserContextType>({
  user: null,
  forceUpdate: () => {},
  loading: true,
  unreadMessages: [],
  unreadMessagesCount: 0,
  markMessagesAsRead: (_messageId: number) => {},
  markRoomAsRead: (_roomId: number) => {},
});

/** Provides user state and actions for React consumers. */
export const useUser = () => useContext(UserContext);

const PUBLIC_PATH_PATTERNS = [
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
  /^\/battle\/battleSimulator$/,
  /^\/about$/,
] as const;

const isPublicPath = (path: string | null) => {
  if (path === null) return false;
  return PUBLIC_PATH_PATTERNS.some((regex) => regex.test(path));
};

interface UsersProviderProps {
  children: ReactNode;
}

/** User provider. */
export const UserProvider: React.FC<UsersProviderProps> = ({ children }) => {
  const router = useRouter();
  const pathName = usePathname();
  const { data: session, status } = useSession();
  const [user, setUser] = useState<UserModel | null>(null); // State holds UserModel instance
  const userId = useMemo(
    () => (session?.user?.id ? Number(session.user.id) : null),
    [session],
  );
  const { addEventListener, removeEventListener } = useSocket(userId);
  const [loading, setLoading] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState<UnreadMessages[]>([]);

  const processAndSetUserData = useCallback(
    (userData: UserApiResponse | PrismaUser) => {
      try {
        // Ensure necessary fields exist before creating UserModel
        if (!userData || typeof userData.id !== 'number') {
          logError('Received invalid user data structure:', userData);
          throw new Error('Invalid user data received');
        }

        // Extract related data from the API response
        const units = (userData as UserApiResponse).UserUnit || [];
        const items = (userData as UserApiResponse).UserItem || [];
        const structure_upgrades =
          (userData as UserApiResponse).UserStructureUpgrade || [];
        const battle_upgrades =
          (userData as UserApiResponse).UserBattleUpgrade || [];
        const bonus_points =
          (userData as UserApiResponse).UserBonusPoints || [];
        const permissions = (userData as UserApiResponse).permissions || [];
        const stats = (userData as UserApiResponse).stats || [];

        const uModel = new UserModel(
          userData as PrismaUser,
          units,
          items,
          structure_upgrades,
          battle_upgrades,
          bonus_points,
          permissions,
          stats,
          false, // filtered
          true, // checkStats
        );
        (uModel as any).currentEra = (userData as any).currentEra;
        logDebug(stringifyObj(uModel));
        setUser(uModel);

        if ('currentStatus' in userData) {
          const status =
            (userData as { currentStatus?: string }).currentStatus || '';
          if (['BANNED', 'SUSPENDED', 'CLOSED', 'TIMEOUT'].includes(status)) {
            router.push('/account/login?error=account_status');
            setUser(null);
            setLoading(false);
            return false;
          }
          if (status === 'VACATION') {
            router.push('/account/login?vacation=1');
            setUser(null);
            setLoading(false);
            return false;
          }
        }

        if ((userData as UserApiResponse).beenAttacked) {
          alertService.error(
            'You have been attacked since you were last active!',
          );
        }
        if ((userData as UserApiResponse).detectedSpy) {
          alertService.error(
            'You have detected a Spy attempt since you were last active!',
          );
        }
        return true; // Indicate success
      } catch (error) {
        logError('Error processing user data:', error, userData);
        // Handle specific error cases if needed
        alertService.error('Failed to process user data.');
        return false; // Indicate failure
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  const fetchUserData = useCallback(
    async (_uID: number, showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const response = await fetch('/api/general/getUser');
        if (!response.ok) throw new Error('Failed to fetch user data');
        const data: UserApiResponse | PrismaUser = await response.json();
        processAndSetUserData(data);
      } catch (error) {
        logError('Error fetching user data:', error);
        alertService.error('Failed to fetch user data.');
        setUser(null);
        setLoading(false);
      }
    },
    [processAndSetUserData],
  );

  useEffect(() => {
    const handleNewMessageNotification = (data: UnreadMessages) => {
      logInfo('Received newMessageNotification:', data);
      setUnreadMessages((prev) => {
        if (prev.some((msg) => msg.id === data.id)) return prev;
        return [...prev, { ...data, isRead: false }].slice(-20);
      });
    };

    addEventListener('newMessageNotification', handleNewMessageNotification);
    return () => {
      removeEventListener(
        'newMessageNotification',
        handleNewMessageNotification,
      );
    };
  }, [addEventListener, removeEventListener]);

  useEffect(() => {
    if (status === 'authenticated' && userId) {
      logInfo('User authenticated. Requesting user data via API...');
      fetchUserData(userId);
    } else if (status === 'unauthenticated' && !isPublicPath(pathName)) {
      logInfo('User unauthenticated on private path, redirecting to login.');
      router.push('/account/login');
      setUser(null);
      setLoading(false);
    } else if (status !== 'loading') {
      setLoading(false);
    }
  }, [status, userId, pathName, router, fetchUserData]);

  // --- Functions to manage unread messages ---
  const markMessagesAsRead = useCallback((messageId: number) => {
    setUnreadMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  const markRoomAsRead = useCallback((roomId: number) => {
    setUnreadMessages((prev) =>
      prev.filter((msg) => msg.chatRoomId !== roomId),
    );
  }, []);

  const unreadMessagesCount = useMemo(
    () => unreadMessages.length,
    [unreadMessages],
  );

  const value = useMemo(
    () => ({
      user, // This is the UserModel instance
      forceUpdate: () => {
        if (userId) {
          // Check if userId is valid
          logInfo('forceUpdate triggered');
          logInfo('forceUpdate: Fetching user data via API');
          fetchUserData(userId, false);
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
    [
      user,
      loading,
      fetchUserData,
      userId,
      unreadMessages,
      unreadMessagesCount,
      markMessagesAsRead,
      markRoomAsRead,
    ],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
