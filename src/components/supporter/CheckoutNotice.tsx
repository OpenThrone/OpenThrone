import { Alert, Button } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CheckoutNoticeState,
  CheckoutReturnState,
} from '@/utils/checkoutReturn';
import {
  confirmCheckoutReturn,
  shouldClearCheckoutReturn,
} from '@/utils/checkoutReturn';
import { loginHrefForReturn } from '@/utils/loginReturn';

export function CheckoutNoticeView({
  state,
  onRetry,
  returnPath,
  onSignIn,
}: {
  state: CheckoutNoticeState;
  onRetry?: () => void;
  returnPath?: string;
  /** The visual guide supplies a mock action instead of navigating. */
  onSignIn?: () => void;
}) {
  const { t } = useTranslation('supporter');
  const router = useRouter();
  const failure = state === 'error' || state === 'declined';
  const warning =
    state === 'pending' || state === 'signedOut' || state === 'priceChanged';
  return (
    <Alert
      color={
        failure
          ? 'red'
          : warning
            ? 'yellow'
            : state === 'confirmed' || state === 'success'
              ? 'green'
              : 'blue'
      }
      role={failure || warning || state === 'subscribed' ? 'alert' : 'status'}
    >
      {t(
        ['error', 'declined', 'success'].includes(state)
          ? state
          : `checkoutNotice.${state}`,
      )}{' '}
      {(state === 'pending' || state === 'error') && onRetry && (
        <Button variant="outline" size="xs" onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
      {state === 'signedOut' &&
        (onSignIn ? (
          <Button variant="outline" size="xs" onClick={onSignIn}>
            {t('signIn')}
          </Button>
        ) : (
          <Button
            component={Link}
            href={loginHrefForReturn(returnPath ?? router.asPath)}
            variant="outline"
            size="xs"
          >
            {t('signIn')}
          </Button>
        ))}
    </Alert>
  );
}

export function useCheckoutReturn(
  key: 'checkout' | 'sponsorship',
  onComplete: (giftCode?: string) => Promise<void>,
) {
  const router = useRouter();
  const started = useRef<string | null>(null);
  const session = useRef<string | null>(null);
  const inFlight = useRef(false);
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const [state, setState] = useState<CheckoutReturnState | null>(null);
  const complete = useCallback(async () => {
    if (!session.current || inFlight.current) return;
    inFlight.current = true;
    setState('confirming');
    try {
      const result = await confirmCheckoutReturn(session.current, (code) =>
        callback.current(code),
      );
      setState(result);
      // A signed-out or pending return must retain the session for login/retry.
      if (shouldClearCheckoutReturn(result)) {
        const query = { ...router.query };
        delete query.session_id;
        delete query[key];
        await router.replace({ pathname: router.pathname, query }, undefined, {
          shallow: true,
        });
      }
    } finally {
      inFlight.current = false;
    }
  }, [key, router]);
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query[key] === 'canceled') {
      setState('canceled');
      const query = { ...router.query };
      delete query[key];
      delete query.session_id;
      router.replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      });
    } else if (
      router.query[key] === 'success' &&
      typeof router.query.session_id === 'string' &&
      started.current !== router.query.session_id
    ) {
      session.current = router.query.session_id;
      started.current = session.current;
      complete().catch(() => {});
    }
  }, [router, key, complete]);
  return { state, retry: complete };
}
