import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';
import useSWR from 'swr';

import { fetchRuntimeConfig } from '@/hooks/useRuntimeConfig';
import {
  DEFAULT_STAMINA_RULES,
  staminaGuideValues,
  type StaminaRules,
} from '@/utils/stamina';

/**
 * Plain-language stamina explanation from the live server rules, shared by
 * How to Play and the FAQ. Shows the defaults until the config loads; reads
 * it once rather than polling, since these pages are public.
 */
export function useStaminaGuide(rulesOverride?: StaminaRules): string {
  const { t, i18n } = useTranslation('common');
  const { data } = useSWR(
    rulesOverride ? null : '/api/config',
    fetchRuntimeConfig,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const number = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );
  const rules = rulesOverride ?? data?.stamina ?? DEFAULT_STAMINA_RULES;
  if (!rules.enabled) return t('stamina.disabled');
  // German and Spanish write 0,5, not 0.5.
  const values = Object.fromEntries(
    Object.entries(staminaGuideValues(rules)).map(([key, value]) => [
      key,
      typeof value === 'number' ? number.format(value) : value,
    ]),
  );
  return [
    t('stamina.guide.intro', values),
    t('stamina.guide.spend', values),
    rules.recoveryEnabled && rules.recoveryAmount > 0
      ? t('stamina.guide.recovery', values)
      : t('stamina.recoveryPaused'),
    t('stamina.guide.penalty', values),
  ].join(' ');
}
