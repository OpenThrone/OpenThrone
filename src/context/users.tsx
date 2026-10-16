import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import useSocket from '@/hooks/useSocket';
import type { users as PrismaUser } from '@/lib/prisma-exports';
import UserModel from '@/models/Users'; // Import UserModel
import { alertService } from '@/services/Alert.service';
import type { UserApiResponse } from '@/types/typings';
import { stringifyObj } from '@/utils/jsonHelpers';
import { logDebug, logError, logInfo, logWarn } from '@/utils/logger';
import { isPublicPath } from '@/utils/publicRoutes';

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

interface UsersProviderProps {
  children: ReactNode;
}

/** User provider. */
export const UserProvider: React.FC<UsersProviderProps> = ({ children }) => {
  const router = useRouter();
  const pathName = usePathname();
  const { data: session, status } = useSession();
  const [user, setUser] = useState<UserModel | null>(null); // State holds UserModel instance
  const sessionUserId = session?.user?.id;
  const userId = useMemo(
    () => (sessionUserId ? Number(sessionUserId) : null),
    [sessionUserId],
  );
  const { addEventListener, removeEventListener } = useSocket(userId);
  const [loading, setLoading] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState<UnreadMessages[]>([]);
  const signingOut = useRef(false);

  const clearInvalidSession = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    setUser(null);
    setUnreadMessages([]);
    setLoading(false);
    try {
      await signOut({ callbackUrl: '/account/login' });
    } catch (error) {
      logError('Failed to sign out invalid session:', error);
      window.location.replace('/account/login');
    }
  }, []);

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
      if (signingOut.current) return;
      if (showLoading) setLoading(true);
      try {
        const response = await fetch('/api/general/getUser');
        if (response.status === 401) {
          await clearInvalidSession();
          return;
        }
        if (!response.ok) throw new Error('Failed to fetch user data');
        const data: UserApiResponse | PrismaUser = await response.json();
        if (signingOut.current) return;
        processAndSetUserData(data);
      } catch (error) {
        logError('Error fetching user data:', error);
        alertService.error('Failed to fetch user data.');
        setUser(null);
        setLoading(false);
      }
    },
    [clearInvalidSession, processAndSetUserData],
  );

  useEffect(() => {
    const handleNewMessageNotification = (data: UnreadMessages) => {
      logInfo('Received newMessageNotification:', data);
      setUnreadMessages((prev) => {
        if (prev.some((msg) => msg.id === data.id)) return prev;
        return [...prev, { ...data, isRead: false }].slice(-20);
      });
    };

    const handleMessagesRead = (data: {
      updates: { messageId: number; userId: number }[];
    }) => {
      const readIds = new Set(
        data.updates
          .filter((update) => update.userId === Number(userId))
          .map((update) => update.messageId),
      );
      setUnreadMessages((previous) =>
        previous.filter((message) => !readIds.has(message.id)),
      );
    };
    addEventListener('messagesRead', handleMessagesRead);
    addEventListener('newMessageNotification', handleNewMessageNotification);
    return () => {
      removeEventListener('messagesRead', handleMessagesRead);
      removeEventListener(
        'newMessageNotification',
        handleNewMessageNotification,
      );
    };
  }, [addEventListener, removeEventListener, userId]);

  useEffect(() => {
    if (pathName === '/auth/logout') {
      setUser(null);
      setUnreadMessages([]);
      setLoading(false);
      return;
    }
    if (status === 'authenticated' && userId) {
      logInfo('User authenticated. Requesting user data via API...');
      fetchUserData(userId);
    } else if (status === 'unauthenticated') {
      setUser(null);
      setUnreadMessages([]);
      setLoading(false);
      if (pathName !== null && !isPublicPath(pathName)) {
        logInfo('User unauthenticated on private path, redirecting to login.');
        router.replace('/account/login');
      }
    } else if (status !== 'loading') {
      setLoading(false);
    }
  }, [status, userId, pathName, router, fetchUserData]);

  // --- Functions to manage unread messages ---
  const markMessagesAsRead = useCallback((messageId: number) => {
    setUnreadMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  const markRoomAsRead = useCallback(
    async (roomId: number) => {
      try {
        const response = await fetch(`/api/messages/${roomId}`);
        if (!response.ok) return;
        const messages: { id: number; readBy?: { userId: number }[] }[] =
          await response.json();
        if (!Array.isArray(messages)) return;
        const readIds = new Set(
          messages
            .filter((message) =>
              message.readBy?.some(
                (reader) => reader.userId === Number(userId),
              ),
            )
            .map((message) => message.id),
        );
        setUnreadMessages((previous) =>
          previous.filter((message) => !readIds.has(message.id)),
        );
      } catch (error) {
        logError('Failed to refresh message read receipts', error);
      }
    },
    [userId],
  );

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
