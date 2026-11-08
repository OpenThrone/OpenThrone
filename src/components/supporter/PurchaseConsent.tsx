import {
  Anchor,
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import { CONSENT_VERSION, consentText } from '@/services/supporter/consent';
import type { CheckoutRequest } from '@/types/supporter';

type Consent = NonNullable<CheckoutRequest['consent']>;

/**
 * The step between Buy and the payment page: the price, renewal and
 * eligibility in plain words, with an unticked box the buyer must tick.
 */
export function PurchaseConsentModal({
  request,
  allianceName,
  busy,
  onCancel,
  onConfirm,
}: {
  request: CheckoutRequest | null;
  allianceName?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (consent: Consent) => void;
}) {
  const { t, i18n } = useTranslation('supporter');
  const [agreed, setAgreed] = useState(false);
  // Every new request (including a re-open after a price change) starts unticked.
  useEffect(() => {
    setAgreed(false);
  }, [request]);
  const close = () => {
    setAgreed(false);
    onCancel();
  };
  return (
    <Modal
      opened={!!request}
      onClose={close}
      title={t('consent.title')}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
    >
      {request && (
        <Stack>
          <Text>{consentText(t, request, allianceName)}</Text>
          <Text size="sm" c="dimmed">
            {t('consent.usOnly')}
          </Text>
          <Group gap="md">
            <Anchor component={Link} href="/legal/terms" target="_blank">
              {t('terms')}
            </Anchor>
            <Anchor component={Link} href="/legal/refunds" target="_blank">
              {t('refunds')}
            </Anchor>
          </Group>
          <Checkbox
            label={t('consent.agree')}
            checked={agreed}
            onChange={(event) => setAgreed(event.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close} disabled={busy}>
              {t('cancel')}
            </Button>
            <Button
              disabled={!agreed}
              loading={busy}
              onClick={() =>
                onConfirm({
                  accepted: true,
                  version: CONSENT_VERSION,
                  locale: i18n.language,
                })
              }
            >
              {t('consent.continue')}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

/** Holds the pending purchase while the buyer reads and accepts the terms. */
export function usePurchaseConsent(
  start: (request: CheckoutRequest) => Promise<void> | void,
) {
  const [pending, setPending] = useState<CheckoutRequest | null>(null);
  return {
    ask: (request: CheckoutRequest) => setPending(request),
    props: {
      request: pending,
      onCancel: () => setPending(null),
      onConfirm: (consent: Consent) => {
        const request = pending;
        if (request) start({ ...request, consent });
      },
    },
  };
}
