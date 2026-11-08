import { Alert, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import { VeteranBadge } from '@/components/player/VeteranBadge';

export type VeteranClaimStatus =
  | 'signedOut'
  | 'ready'
  | 'busy'
  | 'done'
  | 'missing'
  | 'resent';

export type VeteranClaimErrorCode =
  | 'INVALID_LINK'
  | 'NOTHING_TO_CLAIM'
  | 'NAME_MISMATCH'
  | 'NAME_TAKEN'
  | 'FAILED';

export interface VeteranClaimResult {
  title: string;
  veteranSince: string;
  displayName: string;
}

/** Claim step of the Era 1 veteran link from the welcome-back email. */
export function VeteranClaimView({
  status,
  error,
  displayName,
  onDisplayNameChange,
  onClaim,
  onResend,
  loginHref,
  result,
}: {
  status: VeteranClaimStatus;
  error?: VeteranClaimErrorCode | null;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  onClaim: () => void;
  onResend: () => void;
  loginHref: string;
  result?: VeteranClaimResult | null;
}) {
  const { t } = useTranslation('account');

  if (status === 'signedOut') {
    return (
      <Stack>
        <Text>{t('veteranClaim.signInFirst')}</Text>
        <Group>
          <Button component={Link} href={loginHref}>
            {t('veteranClaim.signIn')}
          </Button>
        </Group>
      </Stack>
    );
  }

  if (status === 'done' && result) {
    return (
      <Stack>
        <Alert role="status" color="green" title={t('veteranClaim.doneTitle')}>
          {t('veteranClaim.done', { name: result.displayName })}
        </Alert>
        <Group gap="xs">
          <Text fw={600}>{result.displayName}</Text>
          <VeteranBadge title={result.title} since={result.veteranSince} />
        </Group>
        <Group>
          <Button component={Link} href="/home/overview">
            {t('veteranClaim.continue')}
          </Button>
        </Group>
      </Stack>
    );
  }

  const resendBlock = (
    <Group>
      <Button variant="outline" onClick={onResend}>
        {t('veteranClaim.resend')}
      </Button>
    </Group>
  );

  if (status === 'missing' || status === 'resent') {
    return (
      <Stack>
        <Alert
          role="status"
          color={status === 'resent' ? 'green' : 'yellow'}
          title={t(
            status === 'resent'
              ? 'veteranClaim.resentTitle'
              : 'veteranClaim.missingTitle',
          )}
        >
          {t(
            status === 'resent'
              ? 'veteranClaim.resent'
              : 'veteranClaim.missing',
          )}
        </Alert>
        {status === 'missing' && resendBlock}
      </Stack>
    );
  }

  const linkUnusable = error === 'INVALID_LINK' || error === 'NOTHING_TO_CLAIM';
  return (
    <Stack>
      <Text>{t('veteranClaim.intro')}</Text>
      <TextInput
        label={t('veteranClaim.nameLabel')}
        description={t('veteranClaim.nameHelp')}
        value={displayName}
        maxLength={64}
        autoComplete="off"
        onChange={(event) => onDisplayNameChange(event.currentTarget.value)}
        error={
          error === 'NAME_MISMATCH' || error === 'NAME_TAKEN'
            ? t(`veteranClaim.errors.${error}`)
            : undefined
        }
      />
      {error && error !== 'NAME_MISMATCH' && error !== 'NAME_TAKEN' && (
        <Alert role="alert" color="red" title={t('veteranClaim.errorTitle')}>
          {t(`veteranClaim.errors.${error}`)}
        </Alert>
      )}
      <Group>
        <Button
          loading={status === 'busy'}
          disabled={linkUnusable}
          onClick={onClaim}
        >
          {t('veteranClaim.claim')}
        </Button>
        {error === 'INVALID_LINK' && (
          <Button variant="outline" onClick={onResend}>
            {t('veteranClaim.resend')}
          </Button>
        )}
      </Group>
    </Stack>
  );
}
