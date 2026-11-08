import {
  Accordion,
  Alert,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import MainArea from '@/components/MainArea';
import PublicHero from '@/components/public/PublicHero';
import {
  PurchaseConsentModal,
  usePurchaseConsent,
} from '@/components/supporter/PurchaseConsent';
import { Benefits, PlanCards } from '@/components/supporter/SupporterParts';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import type {
  CheckoutRequest,
  CheckoutResponse,
  SupporterPlan,
} from '@/types/supporter';
import { serverSideTranslations } from '@/utils/serverTranslations';

export default function SupporterPage() {
  const { t } = useTranslation('supporter');
  const { status } = useSession();
  const { config } = useRuntimeConfig();
  const enabled = (config as typeof config & { enableSupporter?: boolean })
    ?.enableSupporter;
  const [plans, setPlans] = useState<SupporterPlan[] | null>(null);
  const [error, setError] = useState(false);
  const [priceChanged, setPriceChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (enabled === false) return;
    fetch('/api/supporter/plans')
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const result = await r.json();
        setPlans(Array.isArray(result) ? result : result.plans);
      })
      .catch(() => setError(true));
  }, [enabled]);
  const startCheckout = async (request: CheckoutRequest) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    setPriceChanged(false);
    try {
      const response = await fetch('/api/supporter/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (response.status === 409) {
        const payload = await response.json().catch(() => ({}));
        if (payload.error === 'price_changed') {
          const updated = await fetch('/api/supporter/plans');
          if (!updated.ok) throw new Error();
          setPlans(await updated.json());
          setPriceChanged(true);
          consent.props.onCancel();
          setBusy(false);
          return;
        }
      }
      if (!response.ok) throw new Error();
      const result: CheckoutResponse = await response.json();
      window.location.assign(result.url);
    } catch {
      setError(true);
      setBusy(false);
    }
  };
  const consent = usePurchaseConsent(startCheckout);
  const choose = (plan: SupporterPlan) => {
    if (status !== 'authenticated') {
      window.location.assign('/account/login');
      return;
    }
    consent.ask({ planId: plan.id, quotedPriceCents: plan.priceCents });
  };
  if (enabled === false)
    return (
      <MainArea title={t('title')}>
        <Text>{t('comingSoon')}</Text>
      </MainArea>
    );
  return (
    <MainArea title={t('title')}>
      <Stack gap="xl">
        <PublicHero title={t('title')} description={t('intro')}>
          {status !== 'authenticated' && (
            <Group>
              <Button component={Link} href="/account/register">
                {t('register')}
              </Button>
              <Button component={Link} href="/account/login" variant="outline">
                {t('login')}
              </Button>
            </Group>
          )}
        </PublicHero>
        <PurchaseConsentModal {...consent.props} busy={busy} />
        <Benefits />
        <section>
          <Title order={2}>{t('pledgeTitle')}</Title>
          <Text>{t('pledge')}</Text>
          <Text mt="md">{t('gifts')}</Text>
        </section>
        {priceChanged && (
          <Alert role="alert" color="yellow">
            {t('checkoutNotice.priceChanged')}
          </Alert>
        )}
        {error && (
          <Alert color="red" role="alert">
            {t('loadError')}
          </Alert>
        )}
        {plans ? (
          <PlanCards
            plans={plans}
            onChoose={choose}
            busy={busy}
            loggedOut={status !== 'authenticated'}
          />
        ) : (
          !error && <Loader aria-label={t('loading')} />
        )}
        <section>
          <Title order={2}>{t('faq')}</Title>
          <Accordion>
            {['', '2', '3', '4'].map((n) => (
              <Accordion.Item key={n} value={`faq${n}`}>
                <Accordion.Control>{t(`faqQ${n}`)}</Accordion.Control>
                <Accordion.Panel>{t(`faqA${n}`)}</Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </section>
        <Group>
          <Button component={Link} href="/legal/terms" variant="outline">
            {t('terms')}
          </Button>
          <Button component={Link} href="/legal/refunds" variant="outline">
            {t('refunds')}
          </Button>
        </Group>
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
