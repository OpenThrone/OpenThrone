import { Alert, Button, Group, Text } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import useSWR from 'swr';

const fetchSummary = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Dues summary unavailable');
  return response.json() as Promise<{
    count: number;
    allianceId: number | null;
    overdue: boolean;
  }>;
};
/** Live-only reminder, shared across pages by SWR without blocking the page. */
export function ForceDuesNotice() {
  const { t } = useTranslation('common');
  const { data } = useSWR('/api/forces/dues-summary', fetchSummary, {
    refreshInterval: 60000,
    dedupingInterval: 30000,
  });
  if (!data?.count || !data.allianceId) return null;
  return (
    <Alert color={data.overdue ? 'yellow' : 'blue'} mb="md" role="status">
      <Group justify="space-between">
        <Text size="sm">
          {t(data.overdue ? 'forceDues.overdue' : 'forceDues.reminder', {
            count: data.count,
          })}
        </Text>
        <Button
          component={Link}
          href={`/alliances/${data.allianceId}/forces`}
          size="xs"
          variant="default"
        >
          {t('forceDues.review')}
        </Button>
      </Group>
    </Alert>
  );
}
