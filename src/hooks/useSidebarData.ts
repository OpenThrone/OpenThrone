import { useDebouncedCallback } from '@mantine/hooks';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { levelXPArray } from '@/constants/XPLevels';
import type UserModel from '@/models/Users';
import { logError } from '@/utils/logger';
import toLocale from '@/utils/numberFormatting';
import { getLevelFromXP } from '@/utils/utilities';

const GOLD_REQUEST_FALLBACK_POLL_MS = 15 * 60 * 1000;
const ADVISOR_ROTATE_MS = 15_000;

const ADVISOR_MESSAGES = [
  'It is better to buy a few stronger weapons than many weaker ones.',
  'The more attack turns you use in an attack, the more experience and gold you will gain.',
  `The more workers you have, the more gold you'll earn per turn.`,
  `Recruiting your max amount every day will ensure your kingdom continues to grow.`,
  `A unit is only as strong as the equipment they wield. Make sure your army is well equipped.`,
  `If your defense is less than 25% of your non-combatant population, you may lose citizens and workers in an attack. Keep your fort repaired.`,
];

interface SidebarStatsState {
  gold: string;
  citizens: string;
  level: string;
  xp: string;
  turns: string;
  xpNextLevel: string;
  progress: string;
}

export function useSidebarData(user: UserModel | null, userLoading: boolean) {
  const router = useRouter();
  const advisorMessages = useMemo(() => ADVISOR_MESSAGES, []);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const advisorIntervalIdRef = useRef<NodeJS.Timer | null>(null);

  const [sidebar, setSidebar] = useState<SidebarStatsState>({
    gold: '0',
    citizens: '0',
    level: '0',
    xp: '0',
    turns: '0',
    xpNextLevel: '0',
    progress: '0',
  });

  const [goldRequestCount, setGoldRequestCount] = useState(0);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);

  const [searchValue, setSearchValue] = useState('');
  const [usersData, setUsersData] = useState<any[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const refreshGoldRequestCount = useCallback(async () => {
    if (!user || userLoading) return;
    try {
      const response = await fetch('/api/social/gold-requests/count');
      if (response.ok) {
        const data = await response.json();
        setGoldRequestCount(Number(data.count) || 0);
      }
    } catch (error) {
      logError('Failed to fetch gold request count:', error);
    }
  }, [user, userLoading]);

  const resetAdvisorInterval = useCallback(() => {
    if (advisorIntervalIdRef.current) {
      clearInterval(advisorIntervalIdRef.current);
    }
    advisorIntervalIdRef.current = setInterval(() => {
      setCurrentMessageIndex(
        (prevIndex) => (prevIndex + 1) % advisorMessages.length,
      );
    }, ADVISOR_ROTATE_MS);
  }, [advisorMessages.length]);

  const handlePrevAdvisor = useCallback(() => {
    setCurrentMessageIndex(
      (prevIndex) =>
        (prevIndex - 1 + advisorMessages.length) % advisorMessages.length,
    );
    resetAdvisorInterval();
  }, [advisorMessages.length, resetAdvisorInterval]);

  const handleNextAdvisor = useCallback(() => {
    setCurrentMessageIndex(
      (prevIndex) => (prevIndex + 1) % advisorMessages.length,
    );
    resetAdvisorInterval();
  }, [advisorMessages.length, resetAdvisorInterval]);

  useEffect(() => {
    resetAdvisorInterval();
    return () => {
      if (advisorIntervalIdRef.current)
        clearInterval(advisorIntervalIdRef.current);
    };
  }, [resetAdvisorInterval]);

  useEffect(() => {
    if (!user || userLoading) return;

    const currentLevelInfo = levelXPArray.find((l) => l.level === user.level);
    const nextLevelInfo = levelXPArray.find((l) => l.level === user.level + 1);

    const xpForCurrentLevel = currentLevelInfo?.xp ?? 0;
    const xpForNextLevel = nextLevelInfo?.xp ?? xpForCurrentLevel;

    const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;
    const xpGainedThisLevel = user.experience - xpForCurrentLevel;

    const progressPercentage =
      xpNeededForNextLevel > 0
        ? (xpGainedThisLevel / xpNeededForNextLevel) * 100
        : 100;

    setSidebar({
      gold: toLocale(user.gold, user?.locale),
      citizens: toLocale(user.citizens, user?.locale),
      level: toLocale(user.level, user?.locale),
      xp: toLocale(user.experience, user?.locale),
      xpNextLevel: toLocale(user.xpToNextLevel, user?.locale),
      progress: progressPercentage.toString(),
      turns: toLocale(user.attackTurns, user?.locale),
    });
  }, [user, userLoading]);

  useEffect(() => {
    refreshGoldRequestCount();
    const interval = setInterval(
      refreshGoldRequestCount,
      GOLD_REQUEST_FALLBACK_POLL_MS,
    );
    return () => clearInterval(interval);
  }, [refreshGoldRequestCount]);

  const fetchUsers = useCallback(async (searchTerm: string): Promise<any[]> => {
    if (!searchTerm.trim()) return [];
    setLoadingSearch(true);
    try {
      const response = await fetch('/api/general/searchUsers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: searchTerm }),
      });
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      return data.map((u: any) => ({
        value: u.display_name,
        label: u.display_name,
        image: u.avatar,
        class: u.class,
        race: u.race,
        experience: getLevelFromXP(u.experience),
        id: u.id,
      }));
    } catch (error) {
      logError('Failed to fetch users:', error);
      return [];
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  const handleSearch = useDebouncedCallback(async (query) => {
    if (!query.trim()) {
      setUsersData([]);
      return;
    }
    const users = await fetchUsers(query);
    setUsersData(users);
  }, 300);

  useEffect(() => {
    handleSearch(searchValue);
  }, [searchValue, handleSearch]);

  const handleItemSubmit = useCallback(
    (value: string) => {
      const selectedUser = usersData.find((u) => u.label === value);
      if (selectedUser) {
        router.push(`/userprofile/${selectedUser.id}`);
      }
    },
    [router, usersData],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const selectedUser = usersData.find(
        (u) => u.label.toLowerCase() === searchValue.toLowerCase(),
      );
      if (selectedUser) {
        router.push(`/userprofile/${selectedUser.id}`);
      }
    },
    [router, searchValue, usersData],
  );

  return {
    advisorMessages,
    currentMessageIndex,
    handlePrevAdvisor,
    handleNextAdvisor,
    sidebar,
    goldRequestCount,
    isNotificationModalOpen,
    setIsNotificationModalOpen,
    refreshGoldRequestCount,
    searchValue,
    setSearchValue,
    usersData,
    loadingSearch,
    handleItemSubmit,
    handleSubmit,
  };
}
