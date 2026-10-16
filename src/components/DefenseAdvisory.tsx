import { Alert, Button, Flex, Text } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import { getDefenseAdvisory } from '@/utils/defenseAdvisory';

interface DefenseAdvisoryProps {
  stats: unknown;
  isViewerDefender: boolean;
}

/** Historical advice for the defender, based only on allowlisted battle facts. */
export function DefenseAdvisory({
  stats,
  isViewerDefender,
}: DefenseAdvisoryProps) {
  const { t } = useTranslation('battle');
  const advisory = getDefenseAdvisory(stats, isViewerDefender);
  if (!advisory) return null;

  return (
    <Alert
      title={t('defenseAdvisory.title')}
      styles={{
        root: {
          background: 'var(--ot-panel)',
          border: '1px solid var(--ot-accent)',
          textAlign: 'left',
        },
        title: { color: 'var(--ot-heading)' },
        message: { color: 'var(--ot-body)' },
      }}
    >
      <Text size="sm">{t(`defenseAdvisory.${advisory}`)}</Text>
      <Flex mt="sm" gap="xs" wrap="wrap">
        <Button component={Link} href="/structures/repair" size="xs">
          {t('defenseAdvisory.repair')}
        </Button>
        <Button
          component={Link}
          href="/battle/training"
          size="xs"
          variant="outline"
        >
          {t('defenseAdvisory.train')}
        </Button>
      </Flex>
    </Alert>
  );
}
