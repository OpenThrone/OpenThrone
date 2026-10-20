import { Badge, Divider, Group, Stack, Text } from '@mantine/core';
import type { TFunction } from 'i18next';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';

import type { GameEventEffects } from '@/constants/gameEvents';
import {
  type ActiveGameEvent,
  useActiveGameEvents,
} from '@/hooks/useActiveGameEvents';
import { toLocale } from '@/utils/numberFormatting';

const formatMultiplier = (value: number) =>
  `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, '')}×`;

/** Short player-facing labels for an event's effects, e.g. "2× XP". */
export function describeEventEffects(
  effects: GameEventEffects,
  t: TFunction,
): string[] {
  const labels: string[] = [];
  if (effects.xpMultiplier && effects.xpMultiplier !== 1)
    labels.push(
      t('events.effects.xp', { value: formatMultiplier(effects.xpMultiplier) }),
    );
  if (effects.goldMultiplier && effects.goldMultiplier !== 1)
    labels.push(
      t('events.effects.gold', {
        value: formatMultiplier(effects.goldMultiplier),
      }),
    );
  if (effects.dailyCitizenBonus)
    labels.push(
      t('events.effects.dailyCitizens', {
        value: toLocale(effects.dailyCitizenBonus),
      }),
    );
  if (effects.citizenMultiplier && effects.citizenMultiplier !== 1)
    labels.push(
      t(`events.effects.citizens${effects.citizenMultiplierScope ?? 'BOTH'}`, {
        value: formatMultiplier(effects.citizenMultiplier),
      }),
    );
  if (effects.extraTurnsPerTick)
    labels.push(
      t('events.effects.turns', { count: effects.extraTurnsPerTick }),
    );
  if (effects.unitCostDiscountPercent)
    labels.push(
      t('events.effects.unitDiscount', {
        value: effects.unitCostDiscountPercent,
      }),
    );
  if (effects.armoryCostDiscountPercent)
    labels.push(
      t('events.effects.armoryDiscount', {
        value: effects.armoryCostDiscountPercent,
      }),
    );
  return labels;
}

function timeLeftLabel(event: ActiveGameEvent, now: number, t: TFunction) {
  if (!event.endsAt) return t('events.untilEraEnd');
  const minutes = Math.max(
    0,
    Math.ceil((new Date(event.endsAt).getTime() - now) / 60_000),
  );
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return t('events.endsInDays', { days, hours });
  if (hours > 0)
    return t('events.endsInHours', { hours, minutes: minutes % 60 });
  return t('events.endsInMinutes', { minutes });
}

/**
 * Running game events (#86) in the sidebar: each event's name, effects and
 * time left. Renders nothing while no event is running.
 */
export const ActiveEventsBanner = React.memo(function ActiveEventsBanner({
  showHeading = true,
}: {
  /** Off where a surrounding card already titles the list. */
  showHeading?: boolean;
}) {
  const { t } = useTranslation('common');
  const { events } = useActiveGameEvents();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!events.length) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [events.length]);

  if (!events.length) return null;

  return (
    <Stack
      gap={8}
      role="region"
      aria-label={t('events.label')}
      data-testid="active-events"
    >
      {showHeading && (
        <>
          <Divider my={4} c="gray" variant="dashed" />
          <Text
            size="xs"
            fw={700}
            tt="uppercase"
            style={{ letterSpacing: '0.12em' }}
          >
            {t('events.label')}
          </Text>
        </>
      )}
      {events.map((event) => (
        <Stack key={event.id} gap={4}>
          <Text size="sm" fw={700} lh={1.2}>
            {event.name}
          </Text>
          <Text size="xs" fw={600} lh={1.2} style={{ opacity: 0.8 }}>
            {timeLeftLabel(event, now, t)}
          </Text>
          <Group gap={4}>
            {describeEventEffects(event.effects, t).map((label) => (
              <Badge
                key={label}
                size="sm"
                variant="filled"
                color="dark"
                radius="sm"
                tt="none"
                style={{ maxWidth: '100%' }}
              >
                {label}
              </Badge>
            ))}
          </Group>
        </Stack>
      ))}
    </Stack>
  );
});
