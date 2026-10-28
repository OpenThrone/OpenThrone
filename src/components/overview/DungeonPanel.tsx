import { faChainSlash, faDungeon } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Badge, Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';

import CollapsibleSection from '@/components/CollapsibleSection';
import { EmptyState } from '@/components/game/EmptyState';
import panelClasses from '@/components/game/Panels.module.css';
import { DUNGEON_FORT_LEVEL } from '@/constants/Captives';
import { alertService } from '@/services/Alert.service';
import type { Locales } from '@/types/typings';
import { logError } from '@/utils/logger';
import { formatGold, toLocale } from '@/utils/numberFormatting';

const DUNGEON_ENDPOINT = '/api/kingdom/dungeon';

/** One captive stack, as /api/kingdom/dungeon returns it. */
export interface DungeonCaptiveRow {
  id: number;
  unitType: string;
  unitLevel: number;
  quantity: number;
  counterpartName: string;
  capturedAt: string;
  /** Gold amounts as strings (BigInt on the server). */
  ransomPrice: string;
  ransomShare: string;
  convertCost: string | null;
  convertReadyAt: string | null;
  escapesAt: string;
}

/** The dungeon payload; hand it in (the visual guide) to skip the API call. */
export interface DungeonData {
  unlocked: boolean;
  fortLevel: number;
  requiredFortLevel: number;
  requiredFortName: string;
  capacity: number;
  held: DungeonCaptiveRow[];
  heldTotal: number;
  mine: DungeonCaptiveRow[];
}

/** Button handlers; hand mock ones in for the visual guide. */
export interface DungeonActions {
  ransom: (id: number) => void;
  release: (id: number) => void;
  convert: (id: number) => void;
}

const hoursUntil = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / (60 * 60 * 1000)));
};

/**
 * The kingdom's dungeon (#210): captives held (ransom value, release and
 * convert actions, convert countdown) and the kingdom's own troops sitting in
 * enemy dungeons (with the ransom price). The held list needs the dungeon
 * unlocked; the kingdom's own captured troops are always listed and
 * ransomable, even below the unlock level. Sits below the desertion log on
 * the kingdom overview, collapsed until opened.
 */
export function DungeonPanel({
  data,
  actions,
}: {
  /** Pre-loaded payload. When given, the panel makes no API call. */
  data?: DungeonData;
  /** Button handlers. When given, the buttons never reach the API. */
  actions?: DungeonActions;
}) {
  const { t, i18n } = useTranslation('kingdom');
  const [fetched, setFetched] = useState<DungeonData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const locale = (i18n.language || 'en-US') as Locales;

  const load = useCallback(async () => {
    try {
      const response = await fetch(DUNGEON_ENDPOINT);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          (payload as { message?: string } | null)?.message ??
            `Request failed with status ${response.status}`,
        );
      }
      setFetched(payload as DungeonData);
      setStatus('ready');
    } catch (error) {
      logError('Failed to load the dungeon:', error);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    // A payload handed in (the visual guide) replaces the fetch entirely.
    if (data) return undefined;
    load();
    return undefined;
  }, [data, load]);

  const liveAction = useCallback(
    async (action: 'ransom' | 'release' | 'convert', id: number) => {
      setBusyId(id);
      try {
        const response = await fetch(`${DUNGEON_ENDPOINT}/actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            captiveId: id,
            operationId: crypto.randomUUID(),
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            (payload as { message?: string } | null)?.message ??
              'The dungeon order failed',
          );
        }
        alertService.success(
          t('dungeon.actionDone', {
            count:
              (payload as { result?: { quantity?: number } } | null)?.result
                ?.quantity ?? 0,
          }),
        );
        await load();
      } catch (error) {
        alertService.error((error as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [load, t],
  );

  const dungeon = data ?? fetched;
  const state = data ? 'ready' : status;

  const run = useMemo<DungeonActions>(
    () => ({
      ransom: (id: number) =>
        actions ? actions.ransom(id) : liveAction('ransom', id),
      release: (id: number) =>
        actions ? actions.release(id) : liveAction('release', id),
      convert: (id: number) =>
        actions ? actions.convert(id) : liveAction('convert', id),
    }),
    [actions, liveAction],
  );

  const unitLabel = (row: DungeonCaptiveRow) =>
    t(`unitTypes.${row.unitType}`, { defaultValue: row.unitType });

  const heldRow = (row: DungeonCaptiveRow) => {
    const readyIn = hoursUntil(row.convertReadyAt);
    const convertible = row.convertReadyAt !== null && (readyIn ?? 0) <= 0;
    const busy = busyId !== null;
    return (
      <Group
        key={row.id}
        justify="space-between"
        gap="sm"
        wrap="nowrap"
        align="flex-start"
        className={panelClasses.insetRow}
      >
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text size="sm" c="var(--ot-body)">
            {t('dungeon.heldRow', {
              count: row.quantity,
              level: row.unitLevel,
              unit: unitLabel(row),
              player: row.counterpartName,
            })}
          </Text>
          <Text size="xs" c="var(--ot-muted)">
            {t('dungeon.ransomHint', {
              price: formatGold(row.ransomPrice, locale),
              share: formatGold(row.ransomShare, locale),
            })}
            {' · '}
            {convertible
              ? t('dungeon.convertReady', {
                  cost: formatGold(row.convertCost ?? '0', locale),
                })
              : t('dungeon.convertIn', { hours: readyIn ?? 0 })}
          </Text>
        </Stack>
        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
          <Button
            size="xs"
            variant="light"
            onClick={() => run.release(row.id)}
            loading={busyId === row.id}
            disabled={busy && busyId !== row.id}
          >
            {t('dungeon.release')}
          </Button>
          <Tooltip
            label={t('dungeon.convertHelp', { hours: readyIn ?? 0 })}
            withArrow
            position="top"
            disabled={convertible}
          >
            <span>
              <Button
                size="xs"
                variant="light"
                color="yellow"
                onClick={() => run.convert(row.id)}
                loading={busyId === row.id}
                disabled={!convertible || (busy && busyId !== row.id)}
              >
                {t('dungeon.convert')}
              </Button>
            </span>
          </Tooltip>
        </Group>
      </Group>
    );
  };

  const mineRow = (row: DungeonCaptiveRow) => {
    const escapesIn = hoursUntil(row.escapesAt);
    const busy = busyId !== null;
    return (
      <Group
        key={row.id}
        justify="space-between"
        gap="sm"
        wrap="nowrap"
        align="flex-start"
        className={panelClasses.insetRow}
      >
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text size="sm" c="var(--ot-body)">
            {t('dungeon.mineRow', {
              count: row.quantity,
              level: row.unitLevel,
              unit: unitLabel(row),
              player: row.counterpartName,
            })}
          </Text>
          <Text size="xs" c="var(--ot-muted)">
            {t('dungeon.ransomPrice', {
              price: formatGold(row.ransomPrice, locale),
            })}
            {escapesIn !== null
              ? ` · ${t('dungeon.escapesIn', { hours: escapesIn })}`
              : ''}
          </Text>
        </Stack>
        <Button
          size="xs"
          variant="light"
          color="green"
          onClick={() => run.ransom(row.id)}
          loading={busyId === row.id}
          disabled={busy && busyId !== row.id}
        >
          {t('dungeon.ransom')}
        </Button>
      </Group>
    );
  };

  const heldCount = dungeon?.held.length ?? 0;
  const mineCount = dungeon?.mine.length ?? 0;

  return (
    <CollapsibleSection
      title={`${t('dungeon.title')}${
        heldCount + mineCount > 0 ? ` (${heldCount + mineCount})` : ''
      }`}
    >
      {state === 'loading' && (
        <Text size="sm" c="var(--ot-muted)">
          {t('dungeon.loading')}
        </Text>
      )}
      {state === 'error' && (
        <Text size="sm" c="red.4">
          {t('dungeon.error')}
        </Text>
      )}
      {state === 'ready' && dungeon && (
        <Stack gap="sm">
          {!dungeon.unlocked && (
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <FontAwesomeIcon
                icon={faChainSlash}
                color="var(--ot-muted)"
                aria-hidden
              />
              <Text size="sm" c="var(--ot-muted)">
                {t('dungeon.locked', {
                  level: dungeon.requiredFortLevel || DUNGEON_FORT_LEVEL,
                  name: dungeon.requiredFortName,
                })}
              </Text>
            </Group>
          )}
          {dungeon.unlocked && (
            <>
              <Group justify="space-between" gap="sm" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                  <FontAwesomeIcon
                    icon={faDungeon}
                    color="var(--ot-muted)"
                    aria-hidden
                  />
                  <Text size="sm" fw={700} c="var(--ot-heading)">
                    {t('dungeon.heldTitle')}
                  </Text>
                </Group>
                <Badge variant="light" color="grape" size="sm">
                  {t('dungeon.capacity', {
                    held: toLocale(dungeon.heldTotal, locale),
                    max: toLocale(dungeon.capacity, locale),
                  })}
                </Badge>
              </Group>
              {heldCount > 0 && dungeon.held.map(heldRow)}
            </>
          )}
          {mineCount > 0 && (
            <>
              <Text size="sm" fw={700} c="var(--ot-heading)" mt="xs">
                {t('dungeon.mineTitle')}
              </Text>
              {dungeon.mine.map(mineRow)}
            </>
          )}
          {heldCount === 0 && mineCount === 0 && (
            <EmptyState compact title={t('dungeon.heldEmpty')} />
          )}
        </Stack>
      )}
    </CollapsibleSection>
  );
}

export default DungeonPanel;
