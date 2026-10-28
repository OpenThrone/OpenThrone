import { faPersonWalkingArrowRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import CollapsibleSection from '@/components/CollapsibleSection';
import { EmptyState } from '@/components/game/EmptyState';
import panelClasses from '@/components/game/Panels.module.css';
import { logError } from '@/utils/logger';

/** One row of the desertion ledger, as /api/kingdom/desertions returns it. */
export interface DesertionEvent {
  id: string | number;
  kind: 'ABANDON' | 'DEFECT' | 'CITIZENS' | 'MERCENARY';
  unitType?: string | null;
  unitLevel?: string | number | null;
  quantity: string | number;
  createdAt: string;
  /** 'lost' = units that left this kingdom, 'received' = defectors it gained. */
  direction?: 'lost' | 'received';
}

const DESERTIONS_ENDPOINT = '/api/kingdom/desertions';
const KINDS: DesertionEvent['kind'][] = [
  'ABANDON',
  'DEFECT',
  'CITIZENS',
  'MERCENARY',
];

/** Counts and levels arrive as numbers or strings; read both. */
function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Keeps only the rows the log can explain, with every field normalised. */
function normaliseEvent(raw: unknown): DesertionEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const kind = String(
    record.kind ?? '',
  ).toUpperCase() as DesertionEvent['kind'];
  if (!KINDS.includes(kind)) return null;
  return {
    id: String(record.id ?? ''),
    kind,
    unitType: typeof record.unitType === 'string' ? record.unitType : null,
    unitLevel:
      typeof record.unitLevel === 'number' ||
      typeof record.unitLevel === 'string'
        ? record.unitLevel
        : null,
    quantity:
      typeof record.quantity === 'number' || typeof record.quantity === 'string'
        ? record.quantity
        : 0,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
    direction: record.direction === 'received' ? 'received' : 'lost',
  };
}

/** "2 hours ago" for the ledger rows; empty when the date is unusable. */
function formatRelativeTime(
  iso: string,
  locale: string,
  justNow: string,
): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return '';
  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  if (Math.abs(deltaSeconds) < 60) return justNow;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const unit = units.find(([, seconds]) => Math.abs(deltaSeconds) >= seconds);
  // A negative offset reads as the past ("2 hours ago"), a positive one as the
  // future ("in 2 hours").
  if (!unit) return formatter.format(deltaSeconds, 'second');
  return formatter.format(Math.round(deltaSeconds / unit[1]), unit[0]);
}

export interface DesertionLogProps {
  /** Pre-loaded rows. When given, the log makes no API call. */
  events?: DesertionEvent[];
  /** How many rows the ledger shows before it counts the rest. */
  limit?: number;
}

/**
 * The kingdom's desertion ledger: who left, who defected and when. Sits below
 * the morale meter on the kingdom overview, collapsed until it is opened.
 */
export function DesertionLog({ events, limit = 5 }: DesertionLogProps) {
  const { t, i18n } = useTranslation('kingdom');
  const [fetched, setFetched] = useState<DesertionEvent[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );

  useEffect(() => {
    // Rows handed in (the visual guide) replace the fetch entirely.
    if (events) return undefined;

    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(DESERTIONS_ENDPOINT);
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            (data as { message?: string } | null)?.message ??
              `Request failed with status ${response.status}`,
          );
        }
        const rows = (data as { desertions?: unknown } | null)?.desertions;
        if (cancelled) return;
        setFetched(
          (Array.isArray(rows) ? rows : [])
            .map(normaliseEvent)
            .filter((event): event is DesertionEvent => event !== null),
        );
        setStatus('ready');
      } catch (error) {
        logError('Failed to load kingdom desertions:', error);
        if (!cancelled) setStatus('error');
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [events]);

  const rows = events ?? fetched;
  const state = events ? 'ready' : status;
  const shown = rows.slice(0, limit);
  const hidden = rows.length - shown.length;
  const locale = i18n.language || 'en';

  const describe = (event: DesertionEvent): string => {
    const count = toNumber(event.quantity);
    const unit = (event.unitType ?? '').toUpperCase();
    const level = Math.max(1, Math.round(toNumber(event.unitLevel)));
    switch (event.kind) {
      case 'CITIZENS':
        return t('desertions.events.citizens', { count });
      case 'ABANDON':
        return t('desertions.events.abandon', { count, level, unit });
      case 'DEFECT':
        // Defectors arrive as untrained citizens (#205): the receiving
        // kingdom's copy counts heads, not the tier the loser lost.
        if (event.direction === 'received')
          return t('desertions.events.defectReceived', { count });
        return t('desertions.events.defectLost', { count, level, unit });
      case 'MERCENARY':
        return t('desertions.events.mercenary', { count, level, unit });
      default:
        return '';
    }
  };

  return (
    <CollapsibleSection
      title={`${t('desertions.title')}${
        rows.length > 0 ? ` (${rows.length})` : ''
      }`}
    >
      {state === 'loading' && (
        <Text size="sm" c="var(--ot-muted)">
          {t('desertions.loading')}
        </Text>
      )}
      {state === 'error' && (
        <Text size="sm" c="red.4">
          {t('desertions.error')}
        </Text>
      )}
      {state === 'ready' && rows.length === 0 && (
        <EmptyState compact title={t('desertions.empty')} />
      )}
      {state === 'ready' && rows.length > 0 && (
        <Stack gap="xs">
          {shown.map((event) => (
            <Group
              key={event.id}
              justify="space-between"
              gap="sm"
              wrap="nowrap"
              align="flex-start"
              className={panelClasses.insetRow}
            >
              <Group gap={6} wrap="nowrap" align="flex-start">
                <FontAwesomeIcon
                  icon={faPersonWalkingArrowRight}
                  color="var(--ot-muted)"
                  aria-hidden
                />
                <Text
                  size="sm"
                  c={
                    event.direction === 'received'
                      ? 'var(--mantine-color-green-3)'
                      : 'var(--ot-body)'
                  }
                >
                  {describe(event)}
                </Text>
              </Group>
              <Text
                size="xs"
                c="var(--ot-muted)"
                style={{ whiteSpace: 'nowrap' }}
              >
                {formatRelativeTime(
                  event.createdAt,
                  locale,
                  t('desertions.justNow'),
                )}
              </Text>
            </Group>
          ))}
          {hidden > 0 && (
            <Text size="xs" c="var(--ot-muted)">
              {t('desertions.more', { count: hidden })}
            </Text>
          )}
        </Stack>
      )}
    </CollapsibleSection>
  );
}

export default DesertionLog;
