import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Pagination,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import { AllianceIntelShareModal } from '@/components/alliance/AllianceIntelShareModal';
import { allianceRequest } from '@/components/alliance/allianceStanding';
import { alertService } from '@/services/Alert.service';
import type { AllianceInfo } from '@/services/Alliance.service';
import type { AllianceCallTypeName } from '@/services/AllianceIntel.service';

interface IntelItem {
  id: number;
  attack_log_id: number;
  type: 'attack' | 'spy';
  attacker_name: string | null;
  defender_name: string | null;
  winner: number;
  timestamp: string | null;
  shared_by_name: string | null;
  note: string | null;
  is_threat: boolean;
  call_id: number | null;
  created_at: string;
  target_user_id: number | null;
  target_display_name: string | null;
  url: string;
}

interface FeedResponse {
  items: IntelItem[];
  total: number;
  page: number;
  totalPages: number;
  canShare: boolean;
  canCall: boolean;
}

interface CallRow {
  id: number;
  call_type: AllianceCallTypeName;
  status: 'OPEN' | 'CLOSED';
  note: string | null;
  created_by: number;
  created_by_name: string | null;
  target_user_id: number;
  target_display_name: string | null;
  target_level: number | null;
  report_count: number;
}

interface CallsResponse {
  calls: CallRow[];
  canCall: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
};

const CALL_COLOR: Record<AllianceCallTypeName, string> = {
  HIT: 'red',
  FARM: 'green',
  RECON: 'blue',
};

/** Feed row for a shared report. */
const IntelItemCard = ({
  item,
  canCall,
  onCallThreat,
}: {
  item: IntelItem;
  canCall: boolean;
  onCallThreat: (item: IntelItem, type: 'HIT' | 'FARM') => void;
}) => {
  const { t } = useTranslation('allianceIntel');
  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap={4}>
        <Group justify="space-between" wrap="wrap">
          <Group gap="xs">
            <Badge variant="light">
              {item.type === 'attack'
                ? t('feed.typeAttack', 'Battle')
                : t('feed.typeSpy', 'Spy report')}
            </Badge>
            {item.is_threat && (
              <Badge color="red" title={t('feed.threatHint')}>
                {t('feed.threat', 'Threat')}
              </Badge>
            )}
            {item.call_id && (
              <Badge variant="outline">
                {t('feed.attachedTo', 'Attached to call #{{id}}', {
                  id: item.call_id,
                })}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {new Date(item.created_at).toLocaleString()}
          </Text>
        </Group>
        <Text size="sm">
          {item.attacker_name ?? t('feed.unknown', 'Unknown')} &rarr;{' '}
          {item.defender_name ?? t('feed.unknown', 'Unknown')}
        </Text>
        {item.target_display_name && (
          <Text size="sm" c="dimmed">
            {t('feed.target', 'Target')}:{' '}
            <Text
              component="a"
              href={`/userprofile/${item.target_user_id}`}
              size="sm"
              inherit
            >
              {item.target_display_name}
            </Text>
          </Text>
        )}
        {item.note && <Text size="sm">{item.note}</Text>}
        <Group justify="space-between" wrap="wrap">
          <Text size="xs" c="dimmed">
            {t('feed.sharedBy', 'Shared by {{name}}', {
              name: item.shared_by_name ?? t('feed.unknown', 'Unknown'),
            })}
          </Text>
          <Group gap="xs">
            {item.is_threat && canCall && item.target_user_id !== null && (
              <>
                <Button
                  size="compact-xs"
                  color="red"
                  variant="light"
                  onClick={() => onCallThreat(item, 'HIT')}
                >
                  {t('feed.callThis', 'Call {{type}} on target', {
                    type: t('calls.hit', 'Hit'),
                  })}
                </Button>
                <Button
                  size="compact-xs"
                  color="green"
                  variant="light"
                  onClick={() => onCallThreat(item, 'FARM')}
                >
                  {t('feed.callThis', 'Call {{type}} on target', {
                    type: t('calls.farm', 'Farm'),
                  })}
                </Button>
              </>
            )}
            <Button
              size="compact-xs"
              variant="default"
              component="a"
              href={item.url}
            >
              {t('feed.view', 'Open report')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Card>
  );
};

/** Intel tab: shared reports feed plus Hit / Farm / Recon calls. */
export const AllianceIntel = ({
  alliance,
  viewerId = null,
}: {
  alliance: AllianceInfo;
  viewerId?: number | null;
}) => {
  const { t } = useTranslation('allianceIntel');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<string>('all');
  const [shareOpen, setShareOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [callType, setCallType] = useState<AllianceCallTypeName>('HIT');
  const [targetName, setTargetName] = useState('');
  const [callNote, setCallNote] = useState('');
  const [busy, setBusy] = useState(false);

  const callFilter = filter.startsWith('call:')
    ? Number(filter.slice(5))
    : null;
  const feedQuery = `allianceId=${alliance.id}&page=${page}${
    filter === 'threats' ? '&filter=threats' : ''
  }${callFilter ? `&callId=${callFilter}` : ''}`;

  const {
    data: feed,
    error: feedError,
    mutate: mutateFeed,
  } = useSWR<FeedResponse>(`/api/alliances/intel?${feedQuery}`, fetcher, {
    keepPreviousData: true,
  });
  const { data: callsData, mutate: mutateCalls } = useSWR<CallsResponse>(
    `/api/alliances/intel/calls?allianceId=${alliance.id}`,
    fetcher,
  );
  const { data: detail } = useSWR(
    detailId
      ? `/api/alliances/intel/calls/detail?allianceId=${alliance.id}&callId=${detailId}`
      : null,
    fetcher,
  );

  const calls = callsData?.calls ?? [];
  const canCall = callsData?.canCall ?? feed?.canCall ?? false;
  const typeLabel = (type: AllianceCallTypeName) =>
    t(`calls.${type.toLowerCase()}`, type);

  const refresh = async () => {
    await Promise.all([mutateFeed(), mutateCalls()]);
  };

  const openCall = async () => {
    if (!targetName.trim() || busy) return;
    setBusy(true);
    try {
      const result = await allianceRequest('/api/alliances/intel/calls', {
        allianceId: alliance.id,
        callType,
        displayName: targetName.trim(),
        ...(callNote.trim() ? { note: callNote.trim() } : {}),
      });
      alertService.success(
        t('calls.opened', 'Call opened; {{count}} member(s) notified', {
          count: result.notified ?? 0,
        }),
      );
      setTargetName('');
      setCallNote('');
      await refresh();
    } catch (err: any) {
      alertService.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const closeCall = async (call: CallRow) => {
    if (busy) return;
    setBusy(true);
    try {
      await allianceRequest('/api/alliances/intel/calls/close', {
        allianceId: alliance.id,
        callId: call.id,
      });
      alertService.success(t('calls.closed', 'Call closed'));
      if (filter === `call:${call.id}`) setFilter('all');
      await refresh();
    } catch (err: any) {
      alertService.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const prefillThreatCall = (item: IntelItem, type: 'HIT' | 'FARM') => {
    setCallType(type);
    setTargetName(item.target_display_name ?? '');
    setCallNote('');
    document
      .getElementById('alliance-intel-call-form')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const filterOptions = [
    { value: 'all', label: t('feed.filterAll', 'All') },
    { value: 'threats', label: t('feed.filterThreats', 'Threats') },
    ...calls.map((call) => ({
      value: `call:${call.id}`,
      label: t('feed.filterCall', 'Call: {{type}} {{name}}', {
        type: typeLabel(call.call_type),
        name: call.target_display_name ?? `#${call.target_user_id}`,
      }),
    })),
  ];

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      <Paper p="md" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={3}>{t('feed.title', 'Shared reports')}</Title>
            {feed?.canShare && (
              <Button onClick={() => setShareOpen(true)}>
                {t('feed.share', 'Share a report')}
              </Button>
            )}
          </Group>
          <Select
            aria-label={t('feed.filterAll', 'All')}
            data={filterOptions}
            value={filter}
            allowDeselect={false}
            onChange={(value) => {
              setFilter(value ?? 'all');
              setPage(1);
            }}
          />
          {feedError && (
            <Text c="red" role="alert">
              {(feedError as Error).message ||
                t('feed.loadError', 'Could not load the intel feed.')}
            </Text>
          )}
          {!feed && !feedError ? (
            <Loader />
          ) : (
            feed && (
              <>
                {feed.items.length === 0 ? (
                  <Text c="dimmed" ta="center" py="md">
                    {t('feed.empty', 'No reports have been shared yet.')}
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {feed.items.map((item) => (
                      <IntelItemCard
                        key={item.id}
                        item={item}
                        canCall={feed.canCall}
                        onCallThreat={prefillThreatCall}
                      />
                    ))}
                  </Stack>
                )}
                {feed.totalPages > 1 && (
                  <Group justify="center">
                    <Pagination
                      value={feed.page}
                      onChange={setPage}
                      total={feed.totalPages}
                      siblings={1}
                    />
                  </Group>
                )}
              </>
            )
          )}
        </Stack>
      </Paper>

      <Paper p="md" radius="md" withBorder>
        <Stack gap="md">
          <Title order={3}>{t('calls.title', 'Open calls')}</Title>

          {canCall && (
            <form
              id="alliance-intel-call-form"
              onSubmit={(event) => {
                event.preventDefault();
                openCall();
              }}
            >
              <Stack gap="xs">
                <SegmentedControl
                  aria-label={t('calls.typeLabel', 'Call type')}
                  value={callType}
                  onChange={(value) =>
                    setCallType(value as AllianceCallTypeName)
                  }
                  data={(['HIT', 'FARM', 'RECON'] as const).map((type) => ({
                    value: type,
                    label: typeLabel(type),
                  }))}
                />
                <TextInput
                  label={t('calls.targetLabel', 'Target (display name)')}
                  placeholder={t('calls.targetPlaceholder', 'Display name')}
                  value={targetName}
                  onChange={(event) => setTargetName(event.currentTarget.value)}
                  maxLength={100}
                />
                <TextInput
                  label={t('calls.noteLabel', 'Note (optional)')}
                  value={callNote}
                  onChange={(event) => setCallNote(event.currentTarget.value)}
                  maxLength={200}
                />
                <Group justify="flex-end">
                  <Button
                    type="submit"
                    loading={busy}
                    disabled={!targetName.trim()}
                  >
                    {t('calls.submit', 'Open call')}
                  </Button>
                </Group>
              </Stack>
            </form>
          )}

          {!callsData ? (
            <Loader />
          ) : calls.length === 0 ? (
            <Text c="dimmed" ta="center">
              {t('calls.empty', 'No open calls.')}
            </Text>
          ) : (
            <Stack gap="xs">
              {calls.map((call) => (
                <Card key={call.id} withBorder padding="sm" radius="md">
                  <Stack gap={4}>
                    <Group justify="space-between" wrap="wrap">
                      <Group gap="xs">
                        <Badge color={CALL_COLOR[call.call_type]}>
                          {typeLabel(call.call_type)}
                        </Badge>
                        <Text
                          component="a"
                          href={`/userprofile/${call.target_user_id}`}
                          fw={600}
                          size="sm"
                        >
                          {call.target_display_name ??
                            `#${call.target_user_id}`}
                        </Text>
                        {call.target_level !== null && (
                          <Text size="xs" c="dimmed">
                            {t('calls.level', 'Level {{level}}', {
                              level: call.target_level,
                            })}
                          </Text>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {t('calls.openedBy', 'by {{name}}', {
                          name: call.created_by_name ?? '-',
                        })}
                      </Text>
                    </Group>
                    {call.note && <Text size="sm">{call.note}</Text>}
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">
                        {t('calls.reports', '{{count}} report(s)', {
                          count: call.report_count,
                        })}
                      </Text>
                      <Group gap="xs">
                        <Button
                          size="compact-xs"
                          variant="default"
                          onClick={() => setDetailId(call.id)}
                        >
                          {t('calls.details', 'Details')}
                        </Button>
                        {/* call_targets holders or the call's creator may close it. */}
                        {(canCall || call.created_by === viewerId) && (
                          <Button
                            size="compact-xs"
                            color="gray"
                            variant="light"
                            disabled={busy}
                            onClick={() => closeCall(call)}
                          >
                            {t('calls.close', 'Close')}
                          </Button>
                        )}
                      </Group>
                    </Group>
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>

      <AllianceIntelShareModal
        opened={shareOpen}
        onClose={() => setShareOpen(false)}
        allianceId={alliance.id}
        onShared={refresh}
      />

      <Modal
        opened={detailId !== null}
        onClose={() => setDetailId(null)}
        size="lg"
        title={
          detail
            ? t('calls.detailTitle', '{{type}} call on {{name}}', {
                type: typeLabel(detail.call.call_type),
                name: detail.call.target_display_name ?? '',
              })
            : t('calls.title', 'Open calls')
        }
      >
        {!detail ? (
          <Loader />
        ) : detail.reports.length === 0 ? (
          <Text c="dimmed">
            {t(
              'calls.detailEmpty',
              'No reports are attached to this call yet.',
            )}
          </Text>
        ) : (
          <Stack gap="xs">
            {(detail.reports as IntelItem[]).map((item) => (
              <IntelItemCard
                key={item.id}
                item={item}
                canCall={false}
                onCallThreat={prefillThreatCall}
              />
            ))}
          </Stack>
        )}
      </Modal>
    </SimpleGrid>
  );
};
