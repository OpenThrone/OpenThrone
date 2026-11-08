import { Alert, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';

/** Shown on a battle report an administrator voided (#229); the report itself stays as history. */
export function VoidedBanner({ reason }: { reason: string }) {
  const { t } = useTranslation('battle');
  return (
    <Alert color="gray" variant="light" role="status" mb="md">
      <Text size="sm" fw={600}>
        {t('void.banner', { reason })}
      </Text>
      <Text size="sm" c="dimmed">
        {t('void.bannerNote')}
      </Text>
    </Alert>
  );
}
