import { useMemo } from 'react';
import useSWR from 'swr';

import {
  combineEventEffects,
  type GameEventEffects,
  type GameEventModifiers,
} from '@/constants/gameEvents';

export interface ActiveGameEvent {
  id: number;
  name: string;
  description: string | null;
  /** Null when the event lasts until the era ends. */
  endsAt: string | null;
  eraBound: boolean;
  effects: GameEventEffects;
}

const EMPTY: ActiveGameEvent[] = [];

/** Running game events and their combined modifiers, refreshed every minute. */
export function useActiveGameEvents(): {
  events: ActiveGameEvent[];
  modifiers: GameEventModifiers;
} {
  const { data } = useSWR<{ events: ActiveGameEvent[] }>(
    '/api/events/active',
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Active events unavailable');
      return response.json();
    },
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
      dedupingInterval: 10_000,
    },
  );
  const events = data?.events ?? EMPTY;
  const modifiers = useMemo(
    () =>
      combineEventEffects(
        events.map((event) => ({
          config: event.effects,
          eraBound: event.eraBound,
        })),
      ),
    [events],
  );
  return { events, modifiers };
}
