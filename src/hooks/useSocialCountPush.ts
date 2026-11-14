import { useEffect, useRef } from 'react';

import useSocket from '@/hooks/useSocket';

/**
 * Applies the server's `socialCountUpdate` push (pending friend and gold
 * requests) as soon as it arrives, instead of waiting for the next poll.
 * Listens only; the user provider owns the connection.
 */
export default function useSocialCountPush(
  enabled: boolean,
  onCount: (count: number) => void,
) {
  const { addEventListener, removeEventListener } = useSocket(null);
  const latest = useRef(onCount);
  latest.current = onCount;

  useEffect(() => {
    if (!enabled) return undefined;
    const handler = (payload: unknown) => {
      const count = Number((payload as { count?: unknown } | null)?.count);
      if (Number.isInteger(count) && count >= 0) latest.current(count);
    };
    addEventListener('socialCountUpdate', handler);
    return () => removeEventListener('socialCountUpdate', handler);
  }, [enabled, addEventListener, removeEventListener]);
}
