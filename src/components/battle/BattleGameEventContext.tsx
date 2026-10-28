import { Button, Popover, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { describeEventEffects } from '@/components/sidebar/ActiveEventsBanner';
import { readBattleGameEvents } from '@/utils/battleGameEvents';

/** Compact report annotation; historical details stay beside the rewards. */
export function BattleGameEventContext({ value }: { value: unknown }) {
  const { t } = useTranslation('battle');
  const { t: common } = useTranslation('common');
  const snapshot = readBattleGameEvents(value);
  if (snapshot && !snapshot.events.length) return null;
  const label = !snapshot
    ? t('gameEvents.history')
    : snapshot.appliedXpMultiplier !== 1
      ? t('gameEvents.xpBonus', { value: snapshot.appliedXpMultiplier })
      : t('gameEvents.eventCount', { count: snapshot.events.length });

  return (
    <Popover
      width={300}
      position="bottom-end"
      withArrow
      shadow="md"
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <Button
          data-report-event-details
          variant={snapshot ? 'light' : 'subtle'}
          size="compact-xs"
          aria-label={t('gameEvents.details', { label })}
        >
          {label}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text fw={600} c="var(--ot-heading)" tabIndex={-1} data-autofocus>
            {t('gameEvents.title')}
          </Text>
          {snapshot ? (
            <>
              {snapshot.events.map((event) => (
                <Stack key={event.id} gap={0}>
                  <Text size="sm" fw={600}>
                    {event.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {describeEventEffects(event.effects, common).join(' · ')}
                  </Text>
                </Stack>
              ))}
              <Text size="sm">
                {t('gameEvents.appliedXp', {
                  value: snapshot.appliedXpMultiplier,
                })}
              </Text>
              <Text size="xs" c="dimmed">
                {t('gameEvents.savedContext')}
              </Text>
            </>
          ) : (
            <Text size="sm" c="dimmed">
              {t('gameEvents.notRecorded')}
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
