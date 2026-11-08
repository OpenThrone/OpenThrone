import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import {
  type ActivityDetails,
  type ActivityItem,
  recordsActivityDetails,
} from '@/utils/adminActivityDetails';
import {
  translateBattleUpgradeName,
  translateUnitName,
} from '@/utils/translateGameNames';

/** Compact transaction facts fit the timeline without hiding counts in a dialog. */
export default function ActivityEventDetails({
  action,
  details,
}: {
  action: string;
  details: ActivityDetails | null;
}) {
  const { t, i18n } = useTranslation(['admin-activity', 'battle']);
  if (!details)
    return (
      <Text size="sm" c="dimmed">
        {recordsActivityDetails(action) ? t('notRecorded') : '—'}
      </Text>
    );
  const number = (value: number) => value.toLocaleString(i18n.language);
  const name = (item: ActivityItem) => {
    const label =
      item.kind === 'unit'
        ? translateUnitName(t, item.name)
        : item.kind === 'battleUpgrade'
          ? translateBattleUpgradeName(t, item.name)
          : item.name;
    return t('eventDetails.entity', { name: label, level: item.level });
  };
  return (
    <Stack gap={4}>
      {details.items.map((item, index) => (
        <Text size="sm" key={index}>
          {t('eventDetails.quantity', {
            quantity: number(item.quantity),
            name: name(item),
          })}
          {item.usage && ` · ${t(`eventDetails.roles.${item.usage}`)}`}
        </Text>
      ))}
      {details.conversions.map((conversion, index) => (
        <Text size="sm" key={`conversion:${index}`}>
          {t('eventDetails.conversion', {
            quantity: number(conversion.quantity),
            from: name(conversion.from),
            to: name(conversion.to),
          })}
        </Text>
      ))}
      {details.newLevel !== undefined && (
        <Text size="sm">
          {t('eventDetails.newLevel', { level: number(details.newLevel) })}
        </Text>
      )}
      {details.repairedHP !== undefined && (
        <Text size="sm">
          {t('eventDetails.repairedHP', { amount: number(details.repairedHP) })}
        </Text>
      )}
      {details.fromAccount && details.toAccount && (
        <Text size="sm">
          {t('eventDetails.movement', {
            from: t(`eventDetails.accounts.${details.fromAccount}`),
            to: t(`eventDetails.accounts.${details.toAccount}`),
          })}
        </Text>
      )}
    </Stack>
  );
}
