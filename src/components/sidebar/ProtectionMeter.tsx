import { Progress, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

import type UserModel from '@/models/Users';
import { toLocale } from '@/utils/numberFormatting';

/**
 * Compact new-player protection meter. Reads the status the player's own data
 * API already serves (`user.protection`), so it adds no polling. Hidden once
 * protection has ended.
 */
export const ProtectionMeter = React.memo(function ProtectionMeter({
  user,
}: {
  user: UserModel | null;
}) {
  const { t } = useTranslation('common');
  const protection = user?.protection;
  if (!user || !protection?.protected) return null;

  const days =
    protection.daysLeft === null ? null : Math.ceil(protection.daysLeft);
  const limits = t('sidebar.protection.orUntil', {
    level: protection.levelLimit,
    population: toLocale(protection.populationThreshold, user.locale),
  });
  const headline =
    days === null
      ? t('sidebar.protection.untilOnly', {
          level: protection.levelLimit,
          population: toLocale(protection.populationThreshold, user.locale),
        })
      : `${t('sidebar.protection.daysLeft', { count: days })} · ${limits}`;

  return (
    <Stack gap={4} role="group" aria-label={t('sidebar.protection.label')}>
      <Text size="xs" fw={600} lh={1.3}>
        {headline}
      </Text>
      {protection.timeRemainingShare !== null && (
        <Progress
          size="sm"
          color="teal"
          value={Math.round(protection.timeRemainingShare * 100)}
          aria-label={t('sidebar.protection.label')}
        />
      )}
    </Stack>
  );
});
