import { Progress, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

import type UserModel from '@/models/Users';
import { getProtectionProgress } from '@/utils/battleProtection';
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
  const headline =
    days === null
      ? t('sidebar.protection.active')
      : t('sidebar.protection.daysLeft', { count: days });
  // The bar fills toward whichever limit ends protection first.
  const progress = getProtectionProgress(protection);
  const percent = Math.round(progress.share * 100);

  return (
    <Stack
      gap={4}
      role="group"
      aria-label={t('sidebar.protection.label')}
      data-tour-id="protection"
    >
      <Text size="xs" fw={600} lh={1.3}>
        {headline}
      </Text>
      <Text size="xs" lh={1.3}>
        {/* Each figure stays on one line; a narrow sidebar wraps at the dot. */}
        <span className="whitespace-nowrap">
          {t('sidebar.protection.population', {
            population: toLocale(protection.population, user.locale),
            threshold: toLocale(protection.populationThreshold, user.locale),
          })}
        </span>{' '}
        ·{' '}
        <span className="whitespace-nowrap">
          {t('sidebar.protection.level', {
            level: protection.level,
            limit: protection.levelLimit,
          })}
        </span>
      </Text>
      <Progress
        size="sm"
        color={progress.share >= 0.8 ? 'orange' : 'teal'}
        value={percent}
        aria-label={t('sidebar.protection.progress', {
          percent,
          limit: t(`sidebar.protection.limits.${progress.limit}`),
        })}
      />
    </Stack>
  );
});
