import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

export type ConfirmErasureStatus =
  | 'ready'
  | 'busy'
  | 'done'
  | 'invalid'
  | 'missing';

/** The confirmation step of an account-deletion request, reached from the email link. */
export function ConfirmErasureView({
  status,
  scheduledFor,
  onConfirm,
}: {
  status: ConfirmErasureStatus;
  scheduledFor?: string | null;
  onConfirm: () => void;
}) {
  const { t, i18n } = useTranslation('account');
  if (status === 'done') {
    const date = scheduledFor
      ? new Date(scheduledFor).toLocaleDateString(i18n.language, {
          dateStyle: 'long',
        })
      : '';
    return (
      <Stack>
        <Alert
          role="status"
          color="green"
          title={t('confirmErasure.doneTitle')}
        >
          {t('confirmErasure.done', { date })}
        </Alert>
        <Group>
          <Button component={Link} href="/account/login" variant="outline">
            {t('confirmErasure.signIn')}
          </Button>
        </Group>
      </Stack>
    );
  }
  if (status === 'invalid' || status === 'missing') {
    return (
      <Stack>
        <Alert
          role="alert"
          color="red"
          title={t('confirmErasure.invalidTitle')}
        >
          {t(
            status === 'missing'
              ? 'confirmErasure.missing'
              : 'confirmErasure.invalid',
          )}
        </Alert>
        <Group>
          <Button
            component={Link}
            href="/home/settings#privacy"
            variant="outline"
          >
            {t('confirmErasure.openSettings')}
          </Button>
        </Group>
      </Stack>
    );
  }
  return (
    <Stack>
      <Text>{t('confirmErasure.intro')}</Text>
      <Text size="sm" c="dimmed">
        {t('confirmErasure.consequences')}
      </Text>
      <Group>
        <Button color="red" loading={status === 'busy'} onClick={onConfirm}>
          {t('confirmErasure.confirm')}
        </Button>
        <Button component={Link} href="/" variant="default">
          {t('confirmErasure.keep')}
        </Button>
      </Group>
    </Stack>
  );
}
