import {
  ActionIcon,
  Button,
  Group,
  Loader,
  NumberInput,
  Pagination,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import {
  allianceRequest,
  getAllianceStanding,
} from '@/components/alliance/allianceStanding';
import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import { alertService } from '@/services/Alert.service';
import type { AllianceInfo } from '@/services/Alliance.service';
import type { AllianceListTypeName } from '@/services/AllianceLists.service';

interface ListEntryRow {
  id: number;
  note: string | null;
  created_at: string;
  added_by_name: string | null;
  target_user_id: number;
  target_display_name: string | null;
  target_level: number | null;
  target_race: string | null;
}

interface ListResponse {
  entries: ListEntryRow[];
  total: number;
  page: number;
  totalPages: number;
}

const fetcher = async (url: string): Promise<ListResponse> => {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
};

/** Farm / Hit / Block target lists shared by an alliance. */
export const AllianceLists = ({
  alliance,
  viewerId,
}: {
  alliance: AllianceInfo;
  viewerId: number | null;
}) => {
  const { t } = useTranslation('allianceLists');
  const standing = getAllianceStanding(alliance, viewerId);
  const canView = standing.can('view_list');
  const canEdit = standing.can('edit_list');

  const [listType, setListType] = useState<AllianceListTypeName>('FARM');
  const [page, setPage] = useState(1);
  const [jumpPage, setJumpPage] = useState<number | string>('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, error, mutate } = useSWR(
    canView
      ? `/api/alliances/lists?allianceId=${alliance.id}&listType=${listType}&page=${page}`
      : null,
    fetcher,
    { keepPreviousData: true },
  );

  if (!canView) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        {t('lists.noAccess', 'Your rank cannot view the alliance lists.')}
      </Text>
    );
  }

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await allianceRequest('/api/alliances/lists/add', {
        allianceId: alliance.id,
        listType,
        displayName: name.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      alertService.success(t('lists.added', 'Player added to the list'));
      setName('');
      setNote('');
      await mutate();
    } catch (err: any) {
      alertService.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: ListEntryRow) => {
    if (busy) return;
    setBusy(true);
    try {
      await allianceRequest(
        `/api/alliances/lists/remove?allianceId=${alliance.id}&entryId=${entry.id}`,
        {},
        'DELETE',
      );
      alertService.success(t('lists.removed', 'Player removed from the list'));
      await mutate();
    } catch (err: any) {
      alertService.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const jump = () => {
    const target = Number(jumpPage);
    if (!Number.isInteger(target) || !data) return;
    setPage(Math.min(Math.max(1, target), data.totalPages));
  };

  return (
    <GameCard
      title={t('lists.title', 'Target Lists')}
      action={
        <SegmentedControl
          aria-label={t('lists.listSwitch', 'Choose a list')}
          value={listType}
          onChange={(value) => {
            setListType(value as AllianceListTypeName);
            setPage(1);
          }}
          data={[
            { value: 'FARM', label: t('lists.farm', 'Farm') },
            { value: 'HIT', label: t('lists.hit', 'Hit') },
            { value: 'BLOCK', label: t('lists.block', 'Block') },
          ]}
        />
      }
    >
      <Stack gap="md">
        {canEdit && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <Group align="flex-end" wrap="wrap">
              <TextInput
                label={t('lists.addLabel', 'Add player')}
                placeholder={t('lists.addPlaceholder', 'Display name')}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={100}
              />
              <TextInput
                aria-label={t('lists.notePlaceholder', 'Note (optional)')}
                placeholder={t('lists.notePlaceholder', 'Note (optional)')}
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
                maxLength={200}
                style={{ flex: 1, minWidth: 180 }}
              />
              <Button type="submit" loading={busy} disabled={!name.trim()}>
                {t('lists.add', 'Add')}
              </Button>
            </Group>
          </form>
        )}

        {error && (
          <Text c="red" role="alert">
            {(error as Error).message ||
              t('lists.loadError', 'Could not load this list.')}
          </Text>
        )}

        {!data && !error ? (
          <Loader />
        ) : (
          data && (
            <>
              <Text size="sm" c="dimmed">
                {t('lists.total', '{{count}} on this list', {
                  count: data.total,
                })}
              </Text>
              <StyledTable
                ariaLabel={t('lists.title', 'Target Lists')}
                tableProps={{ striped: true, highlightOnHover: true }}
                headers={[
                  t('lists.columns.player', 'Player'),
                  t('lists.columns.level', 'Level'),
                  t('lists.columns.race', 'Race'),
                  t('lists.columns.note', 'Note'),
                  t('lists.columns.addedBy', 'Added by'),
                  t('lists.columns.added', 'Added'),
                  ...(canEdit ? [t('lists.columns.actions', 'Actions')] : []),
                ]}
              >
                {data.entries.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={canEdit ? 7 : 6}>
                      <Text c="dimmed" ta="center">
                        {t('lists.empty', 'Nobody is on this list yet.')}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  data.entries.map((entry) => (
                    <Table.Tr key={entry.id}>
                      <Table.Td>
                        <Text
                          component="a"
                          href={`/userprofile/${entry.target_user_id}`}
                          size="sm"
                        >
                          {entry.target_display_name ??
                            `#${entry.target_user_id}`}
                        </Text>
                      </Table.Td>
                      <Table.Td>{entry.target_level ?? '-'}</Table.Td>
                      <Table.Td>{entry.target_race ?? '-'}</Table.Td>
                      <Table.Td>{entry.note ?? ''}</Table.Td>
                      <Table.Td>{entry.added_by_name ?? '-'}</Table.Td>
                      <Table.Td>
                        {new Date(entry.created_at).toLocaleDateString()}
                      </Table.Td>
                      {canEdit && (
                        <Table.Td>
                          <Tooltip
                            label={t(
                              'lists.removeLabel',
                              'Remove {{name}} from the list',
                              { name: entry.target_display_name ?? '' },
                            )}
                          >
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              disabled={busy}
                              aria-label={t(
                                'lists.removeLabel',
                                'Remove {{name}} from the list',
                                { name: entry.target_display_name ?? '' },
                              )}
                              onClick={() => remove(entry)}
                            >
                              <span aria-hidden="true">&times;</span>
                            </ActionIcon>
                          </Tooltip>
                        </Table.Td>
                      )}
                    </Table.Tr>
                  ))
                )}
              </StyledTable>

              {data.totalPages > 1 && (
                <Group justify="space-between" align="flex-end" wrap="wrap">
                  <Pagination
                    value={data.page}
                    onChange={setPage}
                    total={data.totalPages}
                    siblings={1}
                  />
                  <Group gap="xs" align="flex-end">
                    <NumberInput
                      label={t('lists.jumpToPage', 'Go to page')}
                      value={jumpPage}
                      onChange={setJumpPage}
                      min={1}
                      max={data.totalPages}
                      hideControls
                      w={90}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') jump();
                      }}
                    />
                    <Button variant="default" onClick={jump}>
                      {t('lists.jump', 'Go')}
                    </Button>
                  </Group>
                </Group>
              )}
            </>
          )
        )}
      </Stack>
    </GameCard>
  );
};
