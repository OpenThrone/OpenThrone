import { faCircleInfo, faCrown } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  ActionIcon,
  Group,
  Progress,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';

import {
  ARMY_DESERTION_MORALE_THRESHOLD,
  CITIZENS_DESERTION_MORALE_THRESHOLD,
  clampMorale,
  KINGDOM_MORALE_MAX,
} from '@/constants/KingdomMorale';

/** How the kingdom feels, derived from its morale. */
export type KingdomMoraleState = 'steady' | 'restless' | 'mutinous';

/** Mantine theme colour per state; no literal colours, so races retint it. */
const STATE_COLORS: Record<KingdomMoraleState, string> = {
  steady: 'green',
  restless: 'yellow',
  mutinous: 'red',
};

/**
 * The morale state a kingdom is in. The thresholds are the server's own
 * desertion rules, read from the shared constants instead of being copied.
 */
export function getKingdomMoraleState(morale: number): KingdomMoraleState {
  if (morale >= CITIZENS_DESERTION_MORALE_THRESHOLD) return 'steady';
  if (morale >= ARMY_DESERTION_MORALE_THRESHOLD) return 'restless';
  return 'mutinous';
}

export interface KingdomMoraleMeterProps {
  /** Kingdom morale, 0-100. */
  morale: number;
}

/**
 * Kingdom morale bar with the state it puts the kingdom in. Lives on the
 * kingdom overview, above the desertion log.
 */
export function KingdomMoraleMeter({ morale }: KingdomMoraleMeterProps) {
  const { t } = useTranslation('kingdom');
  const value = clampMorale(morale);
  const state = getKingdomMoraleState(value);
  const stateLabel = t(`morale.${state}`);

  return (
    <Stack gap={6} data-testid="kingdom-morale-meter">
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <FontAwesomeIcon
            icon={faCrown}
            color="var(--ot-accent)"
            aria-hidden
          />
          <Text
            size="xs"
            fw={700}
            c="dimmed"
            tt="uppercase"
            style={{ letterSpacing: '0.1em' }}
          >
            {t('morale.label')}
          </Text>
        </Group>
        <Group gap={4} wrap="nowrap">
          <Text size="sm" fw={700} style={{ color: 'var(--ot-accent)' }}>
            {value}/{KINGDOM_MORALE_MAX}
          </Text>
          <Tooltip label={t('morale.tooltip')} withArrow multiline w={280}>
            <ActionIcon
              variant="subtle"
              size="xs"
              color="gray"
              aria-label={t('morale.explain')}
            >
              <FontAwesomeIcon icon={faCircleInfo} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Progress
        value={value}
        color={STATE_COLORS[state]}
        size="md"
        radius="sm"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={KINGDOM_MORALE_MAX}
        aria-valuenow={value}
        aria-label={t('morale.ariaLabel', {
          percent: value,
          state: stateLabel,
        })}
      />
      <Text size="sm" fw={700} c={`${STATE_COLORS[state]}.4`}>
        {stateLabel}
      </Text>
    </Stack>
  );
}

export default KingdomMoraleMeter;
