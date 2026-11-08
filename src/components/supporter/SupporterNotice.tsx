import { Alert, Button } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { useSupporterStatus } from '@/hooks/useSupporterStatus';
import type { CheckoutResponse, SupporterStatus } from '@/types/supporter';

export function SupporterNoticeView({
  status,
  onPortal,
  busy = false,
  error = false,
}: {
  status: SupporterStatus;
  onPortal: () => void;
  busy?: boolean;
  error?: boolean;
}) {
  const { t } = useTranslation('supporter');
  const remaining = status.activeUntil
    ? new Date(status.activeUntil).getTime() - Date.now()
    : 0;
  if (status.status === 'PAST_DUE')
    return (
      <Alert color="yellow" mb="sm">
        {t('pastDue')}{' '}
        {status.canManageBilling && (
          <Button onClick={onPortal} loading={busy}>
            {t('updatePayment')}
          </Button>
        )}
        {error && <span role="alert"> {t('error')}</span>}
      </Alert>
    );
  if (status.isActive && remaining > 0 && remaining <= 7 * 86400000)
    return (
      <Alert color="yellow" mb="sm">
        {t('expiring')}
      </Alert>
    );
  return null;
}

export function SupporterNotice() {
  const { data } = useSupporterStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!data) return null;
  const portal = async () => {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/supporter/portal', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to open billing');
      const result: CheckoutResponse = await response.json();
      window.location.assign(result.url);
    } catch {
      setError(true);
      setBusy(false);
    }
  };
  return (
    <SupporterNoticeView
      status={data}
      onPortal={portal}
      busy={busy}
      error={error}
    />
  );
}
