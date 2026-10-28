import { faBatteryHalf, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'next-i18next';

export interface GarrisonFatigueNoticeProps {
  /** Percent of the defender's power lost to fatigue (0-100). */
  percent: number;
}

/**
 * The garrison fatigue line of a battle report. Shown to both sides when the
 * defender's garrison was worn down by earlier defences on the same day.
 */
export function GarrisonFatigueNotice({ percent }: GarrisonFatigueNoticeProps) {
  const { t } = useTranslation('battle');
  const value = Math.max(0, Math.round(Number(percent) || 0));
  if (value <= 0) return null;

  return (
    <Group gap={6} wrap="nowrap" justify="center" mt="sm">
      <FontAwesomeIcon
        icon={faBatteryHalf}
        color="var(--ot-muted)"
        aria-hidden
      />
      <Text size="sm" c="var(--ot-muted)">
        {t('battleReport.garrisonFatigue', { percent: value })}
      </Text>
      <Tooltip
        label={t('battleReport.garrisonFatigueTooltip')}
        withArrow
        multiline
        w={280}
      >
        <ActionIcon
          variant="subtle"
          size="xs"
          color="gray"
          aria-label={t('battleReport.garrisonFatigueHelp')}
        >
          <FontAwesomeIcon icon={faCircleInfo} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

export default GarrisonFatigueNotice;
