import { faSkull } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Group, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import panelClasses from '@/components/game/Panels.module.css';
import { REANIMATION_FORT_LEVEL } from '@/constants/Reanimation';
import type { Locales } from '@/types/typings';
import { logError } from '@/utils/logger';
import { toLocale } from '@/utils/numberFormatting';

const REANIMATION_ENDPOINT = '/api/kingdom/reanimation';

/** The reanimation payload; hand it in (the visual guide) to skip the API call. */
export interface ReanimationData {
  /** The viewer's race; only UNDEAD has necromancers. */
  race: string;
  unlocked: boolean;
  requiredFortLevel: number;
  requiredFortName: string | null;
  /** Units that rose again this OT day (0 before the day's first battle). */
  reanimatedToday: number;
  /** The day's cap: 2% of the trained combat army. */
  dailyCap: number;
}

/**
 * The Undead racial perk line (#211, phase 5 of #205): how many fallen rose
 * again today against the day's cap. Undead players below fort level 5 see
 * the locked state naming the fort it unlocks at; every other race sees
 * nothing at all. Sits below the dungeon panel on the kingdom overview. If
 * the read fails the line is simply absent (logged, never a broken panel).
 */
export function ReanimationLine({ data }: { data?: ReanimationData }) {
  const { t, i18n } = useTranslation('kingdom');
  const [fetched, setFetched] = useState<ReanimationData | null>(null);
  const locale = (i18n.language || 'en-US') as Locales;

  useEffect(() => {
    // A payload handed in (the visual guide) replaces the fetch entirely.
    if (data) return undefined;
    let cancelled = false;
    fetch(REANIMATION_ENDPOINT)
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            (payload as { message?: string } | null)?.message ??
              `Request failed with status ${response.status}`,
          );
        }
        if (!cancelled) setFetched(payload as ReanimationData);
      })
      .catch((error: unknown) => {
        logError('Failed to load reanimation:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const state = data ?? fetched;
  // Other races have no necromancers: nothing at all renders.
  if (!state || state.race?.toUpperCase() !== 'UNDEAD') return null;

  if (!state.unlocked) {
    return (
      <Group
        gap="sm"
        wrap="nowrap"
        align="flex-start"
        className={panelClasses.insetRow}
        data-testid="reanimation-locked"
      >
        <FontAwesomeIcon icon={faSkull} color="var(--ot-muted)" aria-hidden />
        <Text size="sm" c="var(--ot-muted)">
          {t('reanimation.locked', {
            level: state.requiredFortLevel || REANIMATION_FORT_LEVEL,
            name:
              state.requiredFortName ??
              t('reanimation.fortFallback', {
                level: state.requiredFortLevel || REANIMATION_FORT_LEVEL,
              }),
          })}
        </Text>
      </Group>
    );
  }

  return (
    <Group
      justify="space-between"
      gap="sm"
      wrap="nowrap"
      className={panelClasses.insetRow}
      data-testid="reanimation-line"
    >
      <Group gap={6} wrap="nowrap">
        <FontAwesomeIcon icon={faSkull} color="var(--ot-accent)" aria-hidden />
        <Text size="sm" fw={700} c="var(--ot-heading)">
          {t('reanimation.label')}
        </Text>
      </Group>
      <Text size="sm" fw={700} style={{ color: 'var(--ot-accent)' }}>
        {t('reanimation.status', {
          risen: toLocale(state.reanimatedToday, locale),
          cap: toLocale(state.dailyCap, locale),
        })}
      </Text>
    </Group>
  );
}

export default ReanimationLine;
