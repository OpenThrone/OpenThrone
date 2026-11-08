import { Alert, Button, NumberInput, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import { GameCard } from '@/components/game/GameCard';
import {
  CheckoutNoticeView,
  useCheckoutReturn,
} from '@/components/supporter/CheckoutNotice';
import {
  PurchaseConsentModal,
  usePurchaseConsent,
} from '@/components/supporter/PurchaseConsent';
import { date, money } from '@/components/supporter/SupporterParts';
import type {
  AllianceSponsorshipInfo,
  CheckoutRequest,
  CheckoutResponse,
} from '@/types/supporter';

export function AllianceSponsorshipView({
  info,
  onContribute,
  busy = false,
  error = false,
}: {
  info: AllianceSponsorshipInfo;
  onContribute: (amountCents: number) => void;
  busy?: boolean;
  error?: boolean;
}) {
  const { t } = useTranslation('supporter');
  const [amount, setAmount] = useState<number | string>(5);
  const cents = Math.round(Number(amount) * 100);
  return (
    <GameCard title={t('sponsorship.title')}>
      <Stack gap="sm">
        <Text>{t('sponsorship.explanation')}</Text>
        <Text size="sm">{t('sponsorship.perks')}</Text>
        <Text fw={700}>
          {t('sponsorship.pool', { amount: money(info.poolCents) })}
        </Text>
        <Text>
          {info.isPremium && info.activeUntil
            ? t('sponsorship.activeUntil', { date: date(info.activeUntil) })
            : t('sponsorship.inactive')}
        </Text>
        {info.contributors.length > 0 && (
          <>
            <Text fw={700}>{t('sponsorship.contributors')}</Text>
            <ul>
              {info.contributors.map((contributor) => (
                <li key={contributor.userId}>
                  {contributor.displayName}: {money(contributor.totalCents)}
                </li>
              ))}
            </ul>
          </>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (Number.isFinite(cents) && cents >= 500) onContribute(cents);
          }}
        >
          <Stack gap="sm">
            <NumberInput
              label={t('sponsorship.amount')}
              prefix="$"
              min={5}
              decimalScale={2}
              value={amount}
              onChange={setAmount}
              required
            />
            {error && (
              <Alert color="red" role="alert">
                {t('error')}
              </Alert>
            )}
            <Button
              type="submit"
              loading={busy}
              disabled={!Number.isFinite(cents) || cents < 500}
            >
              {t('sponsorship.contribute')}
            </Button>
          </Stack>
        </form>
      </Stack>
    </GameCard>
  );
}

export function AllianceSponsorshipPanel({
  allianceId,
  allianceName,
}: {
  allianceId: number;
  allianceName: string;
}) {
  const { t } = useTranslation('supporter');
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState(false);
  const { data, error, mutate } = useSWR<AllianceSponsorshipInfo | null>(
    `/api/alliances/${allianceId}/sponsorship`,
    async (url: string) => {
      const response = await fetch(url);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Unable to load sponsorship');
      return response.json();
    },
  );
  const checkout = useCheckoutReturn('sponsorship', async () => {
    await mutate();
  });
  // Declared before the early returns; startCheckout is hoisted below.
  const consent = usePurchaseConsent((request) => startCheckout(request));
  if (error)
    return (
      <Alert color="red" role="alert">
        {t('loadError')}
      </Alert>
    );
  if (!data) return null;
  const startCheckout = async (request: CheckoutRequest) => {
    setBusy(true);
    setCheckoutError(false);
    try {
      const response = await fetch('/api/supporter/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error('Checkout failed');
      const result: CheckoutResponse = await response.json();
      window.location.assign(result.url);
    } catch {
      setCheckoutError(true);
      setBusy(false);
    }
  };
  const contribute = (amountCents: number) =>
    consent.ask({ planId: 'alliance_sponsorship', amountCents, allianceId });
  return (
    <Stack>
      {checkout.state && (
        <CheckoutNoticeView state={checkout.state} onRetry={checkout.retry} />
      )}
      <PurchaseConsentModal
        {...consent.props}
        allianceName={allianceName}
        busy={busy}
      />
      <AllianceSponsorshipView
        info={data}
        onContribute={contribute}
        busy={busy}
        error={checkoutError}
      />
    </Stack>
  );
}
