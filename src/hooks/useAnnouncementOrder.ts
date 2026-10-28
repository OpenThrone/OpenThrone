import { useLocalStorage } from '@mantine/hooks';

import { useUser } from '@/context/users';

export type AnnouncementOrder = 'priority' | 'newest';

/** Device-local preference, scoped to the current player. */
export function useAnnouncementOrder() {
  const { user } = useUser();
  return useLocalStorage<AnnouncementOrder>({
    key: `announcement-order-v1-${user?.id ?? 'guest'}`,
    defaultValue: 'priority',
  });
}
