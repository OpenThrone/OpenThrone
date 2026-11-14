import { i18n as nextI18n } from 'next-i18next';
import { getI18n } from 'react-i18next';

import type { AllianceErrorParams } from '@/constants/allianceErrors';
import { allianceLevelNameKey } from '@/constants/allianceLevels';

type TranslateFn = (key: string, options?: Record<string, unknown>) => unknown;

/** What the API returns for a refused alliance request. */
export interface AllianceErrorSource {
  code?: string;
  error?: string;
  message?: string;
  params?: AllianceErrorParams;
}

/** "3h 12m" for a wait given in minutes. */
const formatWaitMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/**
 * The refusal in the player's language: `alliances:errors.<code>` with the
 * refusal's params (numbers are formatted by the translation, for example
 * `{{room, number}}`), or the English message when the code has no
 * translation yet.
 */
export const allianceErrorText = (
  source: AllianceErrorSource,
  t?: TranslateFn,
): string => {
  const fallback = source.error ?? source.message ?? '';
  if (!source.code) return fallback;
  // next-i18next gives React its instance through I18nextProvider only and
  // never registers it with react-i18next, so getI18n() is null in the app and
  // every refusal stayed English. Its global instance is the page's language.
  const i18n = nextI18n ?? getI18n();
  const translate: TranslateFn | undefined =
    t ?? (i18n ? (key, options) => i18n.t(key, options) : undefined);
  if (!translate) return fallback;

  const params: Record<string, unknown> = { ...source.params };
  if (typeof params.level === 'number') {
    params.levelName = translate(
      `alliances:${allianceLevelNameKey(params.level)}`,
      {
        defaultValue: `Level ${params.level}`,
      },
    );
  }
  if (typeof params.period === 'string') {
    params.periodName = translate(
      `alliances:memberDues.period.${params.period}`,
      { defaultValue: params.period.toLowerCase() },
    );
  }
  if (typeof params.callType === 'string') {
    params.callTypeName = translate(
      `allianceIntel:calls.${params.callType.toLowerCase()}`,
      { defaultValue: params.callType },
    );
  }
  if (typeof params.waitMinutes === 'number') {
    params.wait = formatWaitMinutes(params.waitMinutes);
  }
  const text = translate(`alliances:errors.${source.code}`, {
    ...params,
    defaultValue: fallback,
  });
  return typeof text === 'string' && text ? text : fallback;
};

/** Error thrown for a refused alliance request; message is already translated. */
export class AllianceApiError extends Error {
  readonly code?: string;

  readonly params?: AllianceErrorParams;

  constructor(message: string, source: AllianceErrorSource = {}) {
    super(message);
    this.name = 'AllianceApiError';
    this.code = source.code;
    this.params = source.params;
  }
}

/** Builds the error for a failed response body (translated when it has a code). */
export const allianceApiError = (
  data: AllianceErrorSource | null | undefined,
  status?: number,
): AllianceApiError => {
  const source = data ?? {};
  return new AllianceApiError(
    allianceErrorText(source) ||
      (status ? `Request failed (${status})` : 'Request failed'),
    source,
  );
};
