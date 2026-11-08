import { Box, Group, Progress, Stack, Text, Tooltip } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useId } from 'react';

import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import { StatRow } from '@/components/sidebar/SidebarShared';
import {
  attackerStaminaPercent,
  getArmyStaminaState,
} from '@/constants/ArmyStamina';
import { type StaminaBalanceInput, useStamina } from '@/hooks/useStamina';
import {
  formatStaminaDuration as formatDuration,
  staminaCost,
  type StaminaRules,
} from '@/utils/stamina';

/** Keyboard focus opens the tooltips too, not only the mouse. */
const TOOLTIP_EVENTS = { hover: true, focus: true, touch: false };

/** How to Play entry that explains stamina in full. */
export const STAMINA_GUIDE_HREF = '/how-to-play#combat-stamina';

export function ArmyConditionMeter({
  balance,
  rules,
  turns,
  inkColor,
  offenseUpgradeLevel = 1,
  showLabel = true,
  variant = 'detail',
}: {
  balance: StaminaBalanceInput;
  rules: StaminaRules;
  turns?: number;
  inkColor?: string;
  offenseUpgradeLevel?: number;
  /** Hide the heading when a parent card already names the meter. */
  showLabel?: boolean;
  /**
   * `stat` renders as a parchment sidebar stat row (icon, label, value) with a
   * hairline gauge and one status line only when something needs attention.
   */
  variant?: 'detail' | 'stat';
}) {
  const { t } = useTranslation('common');
  const tooltipId = useId();
  const { now, projected } = useStamina(balance, rules);
  const amount = projected?.stamina ?? balance.stamina;
  const maximum = projected?.maxStamina ?? balance.maxStamina;
  const state = getArmyStaminaState(amount, rules.penaltyThreshold);
  const penalty = attackerStaminaPercent(
    amount,
    rules.penaltyThreshold,
    rules.minOffensePercent / 100,
  );
  const color = { rested: 'green', weary: 'yellow', exhausted: 'red' }[state];
  const rulesLine = t('sidebar.armyCondition.rules', {
    threshold: rules.penaltyThreshold,
    floor: rules.minOffensePercent,
  });
  const nextAt =
    projected &&
    rules.enabled &&
    rules.recoveryEnabled &&
    rules.recoveryAmount > 0 &&
    amount < maximum
      ? projected.staminaUpdatedAt.getTime() +
        rules.recoveryIntervalMinutes * 60_000
      : null;
  const fullAt =
    nextAt === null
      ? null
      : nextAt +
        Math.max(0, Math.ceil((maximum - amount) / rules.recoveryAmount) - 1) *
          rules.recoveryIntervalMinutes *
          60_000;
  const cost =
    turns === undefined
      ? null
      : Math.min(amount, staminaCost(turns, rules, offenseUpgradeLevel));
  const remaining = amount - (cost ?? 0);
  const afterState = getArmyStaminaState(remaining, rules.penaltyThreshold);
  const afterOffense = rules.enabled
    ? 100 -
      attackerStaminaPercent(
        remaining,
        rules.penaltyThreshold,
        rules.minOffensePercent / 100,
      )
    : 100;
  if (variant === 'stat') {
    const recovering =
      rules.enabled &&
      rules.recoveryEnabled &&
      rules.recoveryAmount > 0 &&
      amount < maximum;
    // Line one: how the army fights now. Line two: when it recovers.
    const stateLine = !rules.enabled
      ? [t('sidebar.armyCondition.off')]
      : [
          ...(state !== 'rested' || amount < maximum
            ? [t(`sidebar.armyCondition.${state}`)]
            : []),
          ...(penalty > 0
            ? [t('sidebar.armyCondition.offensePenalty', { percent: penalty })]
            : []),
        ];
    const recoveryLine = !rules.enabled
      ? null
      : recovering
        ? t('sidebar.armyCondition.fullIn', {
            time: formatDuration((fullAt ?? now.getTime()) - now.getTime()),
          })
        : amount < maximum
          ? t('sidebar.armyCondition.paused')
          : null;
    const tooltip = [
      `${t('sidebar.armyCondition.label')} ${amount}/${maximum}.`,
      rules.enabled ? rulesLine : t('sidebar.armyCondition.tooltip'),
      rules.enabled && recovering
        ? `${t('stamina.recoveryRate', {
            amount: rules.recoveryAmount,
            minutes: rules.recoveryIntervalMinutes,
          })} · ${t('stamina.nextIn', {
            time: formatDuration((nextAt ?? now.getTime()) - now.getTime()),
          })}.`
        : null,
      t('sidebar.armyCondition.learnMore'),
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <Stack gap={3} role="group" aria-label={t('sidebar.armyCondition.label')}>
        <Tooltip
          label={tooltip}
          multiline
          w={220}
          withArrow
          events={TOOLTIP_EVENTS}
        >
          {/* Links to the full guide; the row text stays the accessible name. */}
          <Box
            component={Link}
            href={STAMINA_GUIDE_HREF}
            aria-describedby={tooltipId}
            style={{
              display: 'block',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            {/* The gauge shows the maximum; the full amount/max stays in the tooltip and gauge label. */}
            <StatRow
              label={t('sidebar.armyCondition.short')}
              value={String(amount)}
              icon={<RpgAwesomeIcon icon="crossed-swords" fw />}
            />
          </Box>
        </Tooltip>
        <span id={tooltipId} className="sr-only">
          {tooltip}
        </span>
        {/* Aligned with the label column: 16px icon slot plus the row gap. */}
        <Progress
          value={maximum > 0 ? (amount / maximum) * 100 : 0}
          color={rules.enabled ? `${color}.9` : 'gray.7'}
          size={4}
          radius="xs"
          ml={26}
          mr={10}
          aria-label={t('sidebar.armyCondition.label')}
          aria-valuetext={`${amount}/${maximum}`}
          styles={{
            root: {
              backgroundColor: 'rgba(58, 38, 18, 0.2)',
              boxShadow: 'inset 0 1px 1px rgba(58, 38, 18, 0.35)',
            },
          }}
        />
        {stateLine.length > 0 && (
          <Text size="xs" c={inkColor} ml={26} mr={10} lh={1.3}>
            {stateLine.join(' · ')}
            {recoveryLine && (
              <>
                <br />
                {recoveryLine}
              </>
            )}
          </Text>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={4} role="group" aria-label={t('sidebar.armyCondition.label')}>
      {showLabel && (
        <Group gap={6} wrap="nowrap">
          <RpgAwesomeIcon icon="crossed-swords" aria-hidden />
          <Text
            size="xs"
            fw={700}
            tt="uppercase"
            c={inkColor}
            style={{ letterSpacing: '0.06em', whiteSpace: 'nowrap' }}
          >
            {t('sidebar.armyCondition.label')}
          </Text>
        </Group>
      )}
      <Group gap="xs" wrap="nowrap" align="center">
        <Progress
          value={maximum > 0 ? (amount / maximum) * 100 : 0}
          color={rules.enabled ? color : 'gray'}
          size="sm"
          style={{ flex: 1 }}
          aria-label={t('sidebar.armyCondition.label')}
          aria-valuetext={`${amount}/${maximum}`}
        />
        <Text size="xs" fw={700} c={inkColor} style={{ whiteSpace: 'nowrap' }}>
          {amount}/{maximum}
        </Text>
      </Group>
      <Tooltip
        label={rules.enabled ? rulesLine : t('sidebar.armyCondition.tooltip')}
        multiline
        w={260}
        withArrow
        events={TOOLTIP_EVENTS}
      >
        <Text
          size="xs"
          fw={700}
          c={inkColor ?? color}
          tabIndex={0}
          style={{ cursor: 'help', width: 'fit-content' }}
        >
          {rules.enabled ? (
            <>
              {t(`sidebar.armyCondition.${state}`)}
              {penalty > 0 &&
                ` · ${t('sidebar.armyCondition.offensePenalty', { percent: penalty })}`}
            </>
          ) : (
            t('stamina.disabled')
          )}
        </Text>
      </Tooltip>
      <Text size="xs" c={inkColor ?? 'dimmed'}>
        {!rules.enabled ? null : !rules.recoveryEnabled ||
          rules.recoveryAmount <= 0 ? (
          t('stamina.recoveryPaused')
        ) : amount >= maximum ? (
          t('stamina.full')
        ) : (
          <>
            {t('stamina.recoveryRate', {
              amount: rules.recoveryAmount,
              minutes: rules.recoveryIntervalMinutes,
            })}{' '}
            ·{' '}
            {t('stamina.nextIn', {
              time: formatDuration((nextAt ?? now.getTime()) - now.getTime()),
            })}{' '}
            ·{' '}
            {t('stamina.fullIn', {
              time: formatDuration((fullAt ?? now.getTime()) - now.getTime()),
            })}
          </>
        )}
      </Text>
      {cost !== null && (
        <Text size="xs" fw={600} c={inkColor} role="status">
          {t('sidebar.armyCondition.cost', {
            cost,
            state: t(
              `sidebar.armyCondition.${rules.enabled ? afterState : 'rested'}`,
            ),
            offense: afterOffense,
          })}
        </Text>
      )}
    </Stack>
  );
}
