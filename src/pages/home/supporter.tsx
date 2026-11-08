import { Loader, Select, Stack } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useState } from 'react';

import MainArea from '@/components/MainArea';
import {
  CheckoutNoticeView,
  useCheckoutReturn,
} from '@/components/supporter/CheckoutNotice';
import {
  PurchaseConsentModal,
  usePurchaseConsent,
} from '@/components/supporter/PurchaseConsent';
import {
  GiftReveal,
  PatronageCard,
  PatronageRecords,
  PlanCards,
  RedeemForm,
} from '@/components/supporter/SupporterParts';
import { useSupporterStatus } from '@/hooks/useSupporterStatus';
import type {
  CheckoutResponse,
  SupporterHistoryResponse,
  SupporterPlan,
} from '@/types/supporter';
import {
  isSignedOutError,
  selectCheckoutNotice,
  SupporterRequestError,
} from '@/utils/checkoutReturn';
import { serverSideTranslations } from '@/utils/serverTranslations';

export default function Supporter() {
  const { t } = useTranslation('supporter');
  const router = useRouter();
  const {
    data: status,
    error: statusError,
    mutate: refreshStatus,
  } = useSupporterStatus();
  const [data, setData] = useState<{
    history: SupporterHistoryResponse;
    plans: SupporterPlan[];
  } | null>(null);
  const [recipient, setRecipient] = useState<string | null>(null);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(recipientQuery, 300);
  const [players, setPlayers] = useState<
    Array<{ value: string; label: string }>
  >([]);
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setPlayers([]);
      return;
    }
    const controller = new AbortController();
    fetch(
      `/api/general/searchUsers?name=${encodeURIComponent(debouncedQuery.trim())}`,
      { signal: controller.signal },
    )
      .then((response) => (response.ok ? response.json() : []))
      .then((users: Array<{ id: number; display_name: string }>) =>
        setPlayers(
          users.map((user) => ({
            value: String(user.id),
            label: user.display_name,
          })),
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setPlayers([]);
      });
    return () => controller.abort();
  }, [debouncedQuery]);
  const [giftCode, setGiftCode] = useState<string | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const load = useCallback(async () => {
    try {
      const responses = await Promise.all(
        ['/api/supporter/payments', '/api/supporter/plans'].map((url) =>
          fetch(url),
        ),
      );
      const failed =
        responses.find((response) => response.status === 401) ??
        responses.find((response) => !response.ok);
      if (failed) throw new SupporterRequestError(failed.status);
      const [history, planData] = await Promise.all(
        responses.map((r) => r.json()),
      );
      setData({
        history,
        plans: Array.isArray(planData) ? planData : planData.plans,
      });
      setError(false);
      setSignedOut(false);
    } catch (loadError) {
      setSignedOut(isSignedOutError(loadError));
      setError(!isSignedOutError(loadError));
      throw loadError;
    }
  }, []);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  const consent = usePurchaseConsent((request) =>
    action('/api/supporter/checkout', request, 'POST', true),
  );
  const checkout = useCheckoutReturn('checkout', async (code) => {
    if (code) setGiftCode(code);
    // The payment is already confirmed here; a failed refresh must not mark
    // it pending and invite a second confirmation.
    await Promise.all([load(), refreshStatus()]).catch(() => setError(true));
  });
  const action = async (
    url: string,
    body?: object,
    method = 'POST',
    redirect = false,
  ) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    setAlreadySubscribed(false);
    setPriceChanged(false);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body && { body: JSON.stringify(body) }),
      });
      if (response.status === 409 && url === '/api/supporter/checkout') {
        const payload = await response.json().catch(() => ({}));
        if (payload.error === 'price_changed') {
          setPriceChanged(true);
          consent.props.onCancel();
          // Refresh the prices; if that fails the stale-price notice still stands.
          await load().catch(() => {});
        } else setAlreadySubscribed(true);
        return;
      }
      if (!response.ok) throw new SupporterRequestError(response.status);
      const result = await response.json();
      if (redirect) {
        const destination: CheckoutResponse = result;
        window.location.assign(destination.url);
        return;
      }
      await Promise.all([load(), refreshStatus()]);
    } catch (actionError) {
      setSignedOut(isSignedOutError(actionError));
      setError(!isSignedOutError(actionError));
    } finally {
      setBusy(false);
    }
  };
  const notice = selectCheckoutNotice({
    signedOut: signedOut || isSignedOutError(statusError),
    declined: router.query.checkout === 'failed',
    subscribed: alreadySubscribed,
    priceChanged,
    error: error || !!statusError,
    checkout: checkout.state,
    success: router.query.checkout === 'success' && !router.query.session_id,
  });
  const retry = () => {
    setError(false);
    setAlreadySubscribed(false);
    setPriceChanged(false);
    if (checkout.state === 'pending') {
      checkout.retry().catch(() => {});
    } else {
      Promise.all([load(), refreshStatus()]).catch(() => {});
    }
  };
  return (
    <MainArea title={t('title')}>
      <Stack gap="lg">
        {notice && (
          <CheckoutNoticeView
            state={notice}
            onRetry={retry}
            returnPath={router.asPath}
          />
        )}
        {giftCode && notice !== 'signedOut' && <GiftReveal code={giftCode} />}
        <PurchaseConsentModal {...consent.props} busy={busy} />
        {!data || !status ? (
          !notice && <Loader aria-label={t('loading')} />
        ) : (
          <>
            <PatronageCard
              status={status}
              busy={busy}
              onBilling={() =>
                action('/api/supporter/portal', undefined, 'POST', true)
              }
              onBadgeChange={(badgeVisible) =>
                action('/api/supporter/badge', { badgeVisible }, 'PATCH')
              }
            />
            <PlanCards
              currentPlanId={
                status.isActive &&
                status.source === 'SUBSCRIPTION' &&
                !status.cancelAtPeriodEnd
                  ? 'supporter_monthly'
                  : undefined
              }
              giftRecipient={
                <Select
                  label={t('giftRecipient')}
                  description={t('giftRecipientHint')}
                  placeholder={t('giftRecipientSearch')}
                  searchable
                  clearable
                  disabled={busy}
                  value={recipient}
                  onChange={setRecipient}
                  searchValue={recipientQuery}
                  onSearchChange={setRecipientQuery}
                  data={players}
                />
              }
              plans={data.plans}
              busy={busy}
              onChoose={(plan) =>
                consent.ask({
                  planId: plan.id,
                  quotedPriceCents: plan.priceCents,
                  ...(plan.kind === 'GIFT' && recipient
                    ? { recipientUserId: Number(recipient) }
                    : {}),
                })
              }
              redeem={
                <RedeemForm
                  busy={busy}
                  onRedeem={(code) => action('/api/supporter/redeem', { code })}
                />
              }
            />
            <PatronageRecords history={data.history} />
          </>
        )}
      </Stack>
    </MainArea>
  );
}
export const getServerSideProps = async ({ locale }: { locale?: string }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'supporter',
    ])),
  },
});
