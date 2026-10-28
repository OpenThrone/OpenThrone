import {
  Avatar,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';
import useSWR from 'swr';

import {
  allianceRequest,
  getAllianceStanding,
} from '@/components/alliance/allianceStanding';
import { ConfirmActionModal } from '@/components/alliance/ConfirmActionModal';
import { GameCard } from '@/components/game/GameCard';
import { SectionHeading } from '@/components/game/SectionHeading';
import { alertService } from '@/services/Alert.service';
import type { AllianceInfo } from '@/services/Alliance.service';
import { avatarFramingStyle, splitAvatarFraming } from '@/utils/avatarFraming';

interface RelationRow {
  id: number;
  status: 'PENDING' | 'ACTIVE';
  outgoing: boolean;
  accepted_at: string | null;
  other_alliance_id: number;
  other_alliance_name: string;
  other_alliance_avatar: string | null;
}

interface RelationsResponse {
  allies: RelationRow[];
  incoming: RelationRow[];
  outgoing: RelationRow[];
}

interface AllianceOption {
  id: number;
  name: string;
  memberCount: number;
  leaderName: string | null;
}

const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 300;

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
};

/** Allies, incoming and outgoing ally requests for an alliance. */
export const AllianceDiplomacy = ({
  alliance,
  viewerId,
}: {
  alliance: AllianceInfo;
  viewerId: number | null;
}) => {
  const { t } = useTranslation('allianceLists');
  const canManage = getAllianceStanding(alliance, viewerId).can(
    'manage_allies',
  );
  const [target, setTarget] = useState<string | null>(null);
  const [targetOption, setTargetOption] = useState<{
    value: string;
    label: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [breaking, setBreaking] = useState<RelationRow | null>(null);

  const { data, error, mutate } = useSWR<RelationsResponse>(
    `/api/alliances/allies?allianceId=${alliance.id}`,
    fetcher,
  );
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch] = useDebouncedValue(
    searchText.trim(),
    SEARCH_DEBOUNCE_MS,
  );
  const { data: found, isLoading: searching } = useSWR<AllianceOption[]>(
    canManage &&
      debouncedSearch.length >= SEARCH_MIN_CHARS &&
      debouncedSearch !== targetOption?.label
      ? `/api/alliances/search?q=${encodeURIComponent(debouncedSearch)}&excludeId=${alliance.id}`
      : null,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false },
  );

  const options = useMemo(() => {
    const taken = new Set<number>([
      alliance.id,
      ...(data?.allies ?? []).map((r) => r.other_alliance_id),
      ...(data?.incoming ?? []).map((r) => r.other_alliance_id),
      ...(data?.outgoing ?? []).map((r) => r.other_alliance_id),
    ]);
    const results = (Array.isArray(found) ? found : [])
      .filter((a) => !taken.has(a.id))
      .map((a) => ({
        value: String(a.id),
        label: a.leaderName
          ? `${a.name} (${a.leaderName}, ${a.memberCount})`
          : `${a.name} (${a.memberCount})`,
      }));
    // Keep the chosen option listed so the Select can still display it.
    return targetOption && !results.some((o) => o.value === targetOption.value)
      ? [targetOption, ...results]
      : results;
  }, [found, data, alliance.id, targetOption]);

  const run = async (
    url: string,
    body: Record<string, unknown>,
    ok: string,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await allianceRequest(url, body);
      alertService.success(ok);
      setTarget(null);
      setTargetOption(null);
      setSearchText('');
      setBreaking(null);
      await mutate();
    } catch (err: any) {
      alertService.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const row = (rel: RelationRow, actions: React.ReactNode) => (
    <Group key={rel.id} justify="space-between" wrap="nowrap">
      <Group gap="sm" wrap="nowrap">
        <Avatar
          src={splitAvatarFraming(rel.other_alliance_avatar).src}
          styles={{
            image: avatarFramingStyle(
              splitAvatarFraming(rel.other_alliance_avatar).framing ?? {
                x: 50,
                y: 50,
                zoom: 1,
              },
            ),
          }}
          size="sm"
          radius="xl"
        />
        <Text
          component="a"
          href={`/alliances/${rel.other_alliance_id}`}
          fw={600}
        >
          {rel.other_alliance_name}
        </Text>
        {rel.accepted_at && (
          <Text size="xs" c="dimmed">
            {t('diplomacy.since', 'Since {{date}}', {
              date: new Date(rel.accepted_at).toLocaleDateString(),
            })}
          </Text>
        )}
      </Group>
      {canManage && <Group gap="xs">{actions}</Group>}
    </Group>
  );

  const section = (
    title: string,
    empty: string,
    rows: RelationRow[],
    actions: (rel: RelationRow) => React.ReactNode,
  ) => (
    <Stack gap="xs">
      <SectionHeading>{title}</SectionHeading>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          {empty}
        </Text>
      ) : (
        rows.map((rel) => row(rel, actions(rel)))
      )}
    </Stack>
  );

  if (error) {
    return (
      <Text c="red" role="alert">
        {t('diplomacy.loadError', 'Could not load diplomacy.')}
      </Text>
    );
  }
  if (!data) return <Loader />;

  return (
    <GameCard title={t('diplomacy.title', 'Diplomacy')}>
      <Stack gap="lg">
        {section(
          t('diplomacy.allies', 'Allies'),
          t('diplomacy.noAllies', 'No active alliances.'),
          data.allies,
          (rel) => (
            <Button
              size="xs"
              color="red"
              variant="light"
              disabled={busy}
              onClick={() => setBreaking(rel)}
            >
              {t('diplomacy.break', 'Break alliance')}
            </Button>
          ),
        )}

        {section(
          t('diplomacy.incoming', 'Incoming requests'),
          t('diplomacy.noIncoming', 'No incoming requests.'),
          data.incoming,
          (rel) => (
            <>
              <Button
                size="xs"
                loading={busy}
                onClick={() =>
                  run(
                    '/api/alliances/allies/respond',
                    {
                      allianceId: alliance.id,
                      relationId: rel.id,
                      accept: true,
                    },
                    t('diplomacy.accepted', 'Alliance formed'),
                  )
                }
              >
                {t('diplomacy.accept', 'Accept')}
              </Button>
              <Button
                size="xs"
                variant="default"
                disabled={busy}
                onClick={() =>
                  run(
                    '/api/alliances/allies/respond',
                    {
                      allianceId: alliance.id,
                      relationId: rel.id,
                      accept: false,
                    },
                    t('diplomacy.declined', 'Ally request declined'),
                  )
                }
              >
                {t('diplomacy.decline', 'Decline')}
              </Button>
            </>
          ),
        )}

        {section(
          t('diplomacy.outgoing', 'Sent requests'),
          t('diplomacy.noOutgoing', 'No pending requests.'),
          data.outgoing,
          (rel) => (
            <Button
              size="xs"
              variant="default"
              disabled={busy}
              onClick={() =>
                run(
                  '/api/alliances/allies/remove',
                  { allianceId: alliance.id, relationId: rel.id },
                  t('diplomacy.cancelled', 'Ally request cancelled'),
                )
              }
            >
              {t('diplomacy.cancel', 'Cancel request')}
            </Button>
          ),
        )}

        {canManage ? (
          <Stack gap="xs">
            <SectionHeading>
              {t('diplomacy.requestTitle', 'Request an alliance')}
            </SectionHeading>
            <Group align="flex-end">
              <Select
                label={t('diplomacy.searchLabel', 'Alliance')}
                placeholder={t(
                  'diplomacy.searchPlaceholder',
                  'Search alliances',
                )}
                data={options}
                value={target}
                onChange={(value, option) => {
                  setTarget(value);
                  setTargetOption(value ? option : null);
                }}
                searchable
                searchValue={searchText}
                onSearchChange={setSearchText}
                filter={({ options: opts }) => opts}
                rightSection={searching ? <Loader size="xs" /> : undefined}
                nothingFoundMessage={
                  searchText.trim().length < SEARCH_MIN_CHARS
                    ? t('diplomacy.searchHint', 'Type at least 2 characters')
                    : t('diplomacy.searchEmpty', 'No alliances found')
                }
                style={{ flex: 1, minWidth: 220 }}
              />
              <Button
                loading={busy}
                disabled={!target}
                onClick={() =>
                  run(
                    '/api/alliances/allies/request',
                    {
                      allianceId: alliance.id,
                      targetAllianceId: Number(target),
                    },
                    t('diplomacy.sent', 'Ally request sent'),
                  )
                }
              >
                {t('diplomacy.send', 'Send request')}
              </Button>
            </Group>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            {t('diplomacy.viewOnly', 'Your rank cannot manage allies.')}
          </Text>
        )}
      </Stack>

      <ConfirmActionModal
        opened={breaking !== null}
        title={t('diplomacy.breakTitle', 'Break alliance?')}
        message={t(
          'diplomacy.breakMessage',
          'Break the alliance with {{name}}?',
          { name: breaking?.other_alliance_name ?? '' },
        )}
        confirmLabel={t('diplomacy.break', 'Break alliance')}
        loading={busy}
        onClose={() => setBreaking(null)}
        onConfirm={() =>
          breaking &&
          run(
            '/api/alliances/allies/remove',
            { allianceId: alliance.id, relationId: breaking.id },
            t('diplomacy.broken', 'Alliance broken'),
          )
        }
      />
    </GameCard>
  );
};
