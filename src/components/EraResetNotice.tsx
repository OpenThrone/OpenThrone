import { Alert, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import {
  formatEraResetLocalTime,
  formatEraResetTime,
  useEraResetSchedule,
} from '@/hooks/useEraResetSchedule';

export default function EraResetNotice() {
  const { t } = useTranslation('common');
  const { data: schedule } = useEraResetSchedule();
  if (!schedule) return null;
  return (
    <Alert
      color="yellow"
      title={t(
        schedule.state === 'closing'
          ? 'eraResetNotice.started'
          : 'eraResetNotice.scheduled',
        {
          local: formatEraResetLocalTime(schedule.resetAt),
          utc: formatEraResetTime(schedule.resetAt),
        },
      )}
      mb="sm"
    >
      <Text size="sm">{t('eraResetNotice.scope')}</Text>
      {schedule.state === 'closing' && (
        <Text size="sm">{t('eraResetNotice.closed')}</Text>
      )}
    </Alert>
  );
}
