import { useCallback, useEffect, useState } from 'react';

import { useUser } from '@/context/users';
import { logError } from '@/utils/logger';
import type { TutorialAction, TutorialState } from '@/utils/tutorialState';
import { applyTutorialAction, parseTutorialState } from '@/utils/tutorialState';

/** Lets every `useTutorialState` on the page (tour, Learn page) stay in step. */
const SYNC_EVENT = 'openthrone:tutorial-state';

/**
 * Shared by all instances. `contextJson` is the last value the user context
 * served, so a refresh that returns the same (possibly stale) value never
 * overwrites a newer local change.
 */
const shared: {
  userId: number | null;
  contextJson: string | null;
  state: TutorialState | null;
} = { userId: null, contextJson: null, state: null };

const publish = (state: TutorialState) => {
  shared.state = state;
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: state }));
};

/**
 * Tutorial progress for the signed-in player. Changes show immediately and are
 * saved to the account, so they survive cleared cookies and storage.
 */
export function useTutorialState() {
  const { user, loading } = useUser();
  const userId = user?.id ?? null;
  const serverJson = JSON.stringify(user?.tutorialState ?? null);
  const [state, setState] = useState<TutorialState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading || userId === null) return;
    if (shared.userId !== userId || shared.contextJson !== serverJson) {
      shared.userId = userId;
      shared.contextJson = serverJson;
      shared.state = parseTutorialState(JSON.parse(serverJson));
    }
    setState(shared.state);
    setReady(true);
  }, [loading, userId, serverJson]);

  useEffect(() => {
    const onSync = (event: Event) =>
      setState((event as CustomEvent<TutorialState>).detail);
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  const dispatch = useCallback(async (action: TutorialAction) => {
    publish(applyTutorialAction(shared.state, action));
    try {
      const response = await fetch('/api/account/tutorial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const data = await response.json();
      const saved = parseTutorialState(data?.tutorial);
      if (saved) publish(saved);
    } catch (error) {
      // Keep the optimistic state so the tour still behaves this session.
      logError('Failed to save tutorial progress:', error);
    }
  }, []);

  return { state, ready, dispatch };
}
