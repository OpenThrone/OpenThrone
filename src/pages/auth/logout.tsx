import { signOut } from 'next-auth/react';
import { useEffect } from 'react';

import LoadingDots from '@/components/loading-dots';
import { logError } from '@/utils/logger';

/** Compatibility route for old links; use NextAuth's CSRF-protected sign-out. */
export default function Logout() {
  useEffect(() => {
    signOut({ callbackUrl: '/account/login' }).catch((error) => {
      logError('Failed to sign out:', error);
      window.location.replace('/account/login');
    });
  }, []);

  return <LoadingDots />;
}
