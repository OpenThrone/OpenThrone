import { Alert, Button, Group } from '@mantine/core';
import { useTranslation } from 'next-i18next';

interface AdminRequestStateProps {
  message: string;
  onRetry: () => void;
}

export default function AdminRequestState({
  message,
  onRetry,
}: AdminRequestStateProps) {
  const { t } = useTranslation('admin-content');
  return (
    <Alert color="red" role="alert" title={t('request.loadTitle')}>
      <Group justify="space-between" align="center">
        <span>{message}</span>
        <Button variant="light" onClick={onRetry}>
          {t('request.retry')}
        </Button>
      </Group>
    </Alert>
  );
}
