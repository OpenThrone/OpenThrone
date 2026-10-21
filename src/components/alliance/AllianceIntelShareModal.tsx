import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { allianceRequest } from '@/components/alliance/allianceStanding';
import { StyledTable } from '@/components/game/StyledTable';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { Log } from '@/types/typings';
import { logError } from '@/utils/logger';
import { formatDate } from '@/utils/utilities';

const ROWS_PER_PAGE = 5;
const NOTE_MAX = 200;

interface CallOption {
  id: number;
  call_type: string;
  target_display_name: string | null;
}

interface AllianceIntelShareModalProps {
  opened: boolean;
  onClose: () => void;
  allianceId: number;
  /** When set the report is fixed (report page); otherwise the user picks one. */
  attackLogId?: number;
  /** Fixed-report mode: whether the viewer was the defender. */
  canReportThreat?: boolean;
  /** Pre-selected call when sharing from a call's detail view. */
  initialCallId?: number | null;
  onShared?: () => void;
}

const callsFetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as { calls: CallOption[] };
};

/** Shares one of the player's own reports with an alliance. */
export const AllianceIntelShareModal = ({
  opened,
  onClose,
  allianceId,
  attackLogId,
  canReportThreat = false,
  initialCallId = null,
  onShared,
}: AllianceIntelShareModalProps) => {
  const { t } = useTranslation('allianceIntel');
  const { user } = useUser();
  const viewerId = Number(user?.id);

  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [selected, setSelected] = useState<Log | null>(null);
  const [note, setNote] = useState('');
  const [callId, setCallId] = useState<string | null>(
    initialCallId ? String(initialCallId) : null,
  );
  const [threat, setThreat] = useState(false);
  const [busy, setBusy] = useState(false);

  const fixed = attackLogId !== undefined;
  const reportId = fixed ? attackLogId : selected?.id;
  const threatAllowed = fixed
    ? canReportThreat
    : !!selected && Number(selected.defender_id) === viewerId;

  const { data: callData } = useSWR(
    opened ? `/api/alliances/intel/calls?allianceId=${allianceId}` : null,
    callsFetcher,
  );

  useEffect(() => {
    if (!opened) {
      setSelected(null);
      setNote('');
      setThreat(false);
      setCallId(initialCallId ? String(initialCallId) : null);
      setPage(1);
      return;
    }
    if (fixed || !viewerId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/attack/logs?limit=${ROWS_PER_PAGE}&page=${page - 1}`)
      .then((res) => {
        if (!res.ok) throw new Error(t('share.loadError', 'Could not load.'));
        return res.json();
      })
      .then((data) => {
        setLogs(Array.isArray(data.data) ? data.data : []);
        setTotalPages(Math.ceil((data.total ?? 0) / ROWS_PER_PAGE));
      })
      .catch((err) => {
        logError('Error fetching reports for intel share', err);
        setError(err.message);
        setLogs([]);
      })
      .finally(() => setLoading(false));
  }, [opened, fixed, viewerId, page, initialCallId, t]);

  const submit = async () => {
    if (!reportId || busy) return;
    setBusy(true);
    try {
      await allianceRequest('/api/alliances/intel/share', {
        allianceId,
        attackLogId: reportId,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(callId ? { callId: Number(callId) } : {}),
        ...(threat && threatAllowed ? { reportThreat: true } : {}),
      });
      alertService.success(
        t('share.shared', 'Report shared with the alliance'),
      );
      onShared?.();
      onClose();
    } catch (err: any) {
      alertService.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const you = t('share.you', 'You');
  const unknown = t('share.unknownPlayer', 'Unknown player');
  const showForm = fixed || !!selected;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('share.title', 'Share with alliance')}
      size="lg"
    >
      {!showForm && (
        <Stack gap="sm">
          <Text fw={600}>
            {t('share.pickTitle', 'Choose a report to share')}
          </Text>
          {loading && (
            <Group justify="center" p="md">
              <Loader size="sm" />
            </Group>
          )}
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          {!loading && !error && logs.length === 0 && (
            <Text c="dimmed" ta="center">
              {t('share.pickEmpty', 'No recent reports found.')}
            </Text>
          )}
          {!loading && logs.length > 0 && (
            <StyledTable
              ariaLabel={t('share.pickTitle', 'Choose a report to share')}
              tableProps={{ striped: true, highlightOnHover: true }}
              headers={[
                t('share.report', 'Report'),
                t('share.date', 'Date'),
                <Table.Th key="action" />,
              ]}
            >
              {logs.map((log) => (
                <Table.Tr key={log.id}>
                  <Table.Td>
                    {t('share.battleRow', '{{attacker}} vs {{defender}}', {
                      attacker:
                        Number(log.attacker_id) === viewerId
                          ? you
                          : (log.attackerPlayer?.display_name ?? unknown),
                      defender:
                        Number(log.defender_id) === viewerId
                          ? you
                          : (log.defenderPlayer?.display_name ?? unknown),
                    })}
                  </Table.Td>
                  <Table.Td>{formatDate(log.timestamp)}</Table.Td>
                  <Table.Td>
                    <Button size="xs" onClick={() => setSelected(log)}>
                      {t('share.pickAction', 'Select')}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </StyledTable>
          )}
          {totalPages > 1 && (
            <Group justify="center">
              <Pagination total={totalPages} value={page} onChange={setPage} />
            </Group>
          )}
        </Stack>
      )}

      {showForm && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap="sm">
            <Textarea
              label={t('share.noteLabel', 'Note (optional)')}
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              maxLength={NOTE_MAX}
              autosize
              minRows={2}
            />
            <Select
              label={t('share.callLabel', 'Attach to a call (optional)')}
              placeholder={t('share.callNone', 'No call')}
              clearable
              value={callId}
              onChange={setCallId}
              data={(callData?.calls ?? []).map((call) => ({
                value: String(call.id),
                label: `${call.call_type} - ${call.target_display_name ?? `#${call.id}`}`,
              }))}
            />
            {threatAllowed && (
              <Checkbox
                label={t(
                  'share.threatLabel',
                  'Report that I am being targeted',
                )}
                description={t(
                  'share.threatHint',
                  'Officers will see a Threat badge and can open a call in one click.',
                )}
                checked={threat}
                onChange={(event) => setThreat(event.currentTarget.checked)}
              />
            )}
            <Group justify="flex-end">
              {!fixed && (
                <Button variant="default" onClick={() => setSelected(null)}>
                  {t('share.pickTitle', 'Choose a report to share')}
                </Button>
              )}
              <Button variant="default" onClick={onClose}>
                {t('share.cancel', 'Cancel')}
              </Button>
              <Button type="submit" loading={busy}>
                {t('share.submit', 'Share')}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
};
