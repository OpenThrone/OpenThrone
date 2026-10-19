import { signIn, signOut, useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { logError } from '@/utils/logger';

/**
 * Ends an impersonation (#92): switches back to the admin's own account and
 * opens the Administration panel, or signs out when that isn't allowed.
 */
export async function endImpersonation(): Promise<void> {
  try {
    const response = await fetch('/api/admin/impersonate/stop', {
      method: 'POST',
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload?.returnTicket) {
      const result = await signIn('credentials', {
        redirect: false,
        returnToAdmin: 'true',
        impersonationTicket: payload.returnTicket,
      });
      if (result?.ok && !result.error) {
        window.location.href = '/home/admin';
        return;
      }
    }
  } catch (error) {
    logError('Failed to return from impersonation:', error);
  }
  await signOut({ callbackUrl: '/account/login' });
}

/**
 * Impersonation state for the current session: whether it is active, the
 * milliseconds left before it is signed out, and the end action. Signs the
 * whole session out once the limit passes (the server refuses it as well).
 */
export function useImpersonation() {
  const { data: session } = useSession();
  const user = session?.user as
    | { impersonatedBy?: number; impersonationExpiresAt?: number }
    | undefined;
  const isImpersonating = Boolean(user?.impersonatedBy);
  const expiresAt = Number(user?.impersonationExpiresAt) || null;
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (!isImpersonating) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isImpersonating]);

  const msLeft =
    isImpersonating && expiresAt ? Math.max(0, expiresAt - now) : null;

  useEffect(() => {
    if (isImpersonating && msLeft === 0 && !ending) {
      setEnding(true);
      signOut({ callbackUrl: '/account/login' });
    }
  }, [isImpersonating, msLeft, ending]);

  const end = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    await endImpersonation();
  }, [ending]);

  return { isImpersonating, msLeft, end, ending };
}

/** m:ss for the impersonation countdown. */
export const formatImpersonationTimeLeft = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
