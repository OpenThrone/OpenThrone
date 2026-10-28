import { Button, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import { AllianceIntelShareModal } from '@/components/alliance/AllianceIntelShareModal';
import type { SharePlayer } from '@/components/battle/ReportSharingControls';
import { ReportSharingControls } from '@/components/battle/ReportSharingControls';
import type {
  ReportShareAction,
  ReportSharingState,
} from '@/services/ReportSharing.service';
import { logError } from '@/utils/logger';

export function ReportShareModal({
  logId,
  opened,
  onClose,
}: {
  logId: number;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('battle');
  const [detailedAlliance, setDetailedAlliance] = useState<number | null>(null);
  const [state, setState] = useState<ReportSharingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [searchError, setSearchError] = useState('');
  const [search, setSearch] = useState('');
  const [term] = useDebouncedValue(search, 300);
  const [players, setPlayers] = useState<SharePlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    setDetailedAlliance(null);
    setState(null);
    setError('');
    setMessage('');
    setSearch('');
    setPlayers([]);
    (async () => {
      try {
        const response = await fetch(`/api/attack/logs/${logId}/sharing`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Sharing load failed');
        const data: ReportSharingState = await response.json();
        if (!controller.signal.aborted) setState(data);
      } catch (e) {
        if (!controller.signal.aborted) {
          logError('Sharing load failed', e);
          setError(t('sharing.loadError'));
        }
      }
    })();
    return () => controller.abort();
  }, [opened, logId, t, reload]);
  useEffect(() => {
    setPlayers([]);
    setSearching(false);
    setSearchError('');
    if (!opened || term.trim().length < 2) return;
    setSearching(true);
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(
          `/api/general/searchUsers?name=${encodeURIComponent(term.trim())}`,
          { signal: controller.signal },
        );
        if (response.status === 404) return;
        if (!response.ok) throw new Error('Player search failed');
        const data = await response.json();
        if (!controller.signal.aborted)
          setPlayers(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!controller.signal.aborted) {
          logError('Player search failed', e);
          setSearchError(t('sharing.searchError'));
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    })();
    return () => controller.abort();
  }, [opened, term, t]);
  const onAction = async (action: ReportShareAction) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/attack/logs/${logId}/sharing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      if (!response.ok) throw new Error('Sharing update failed');
      setState(await response.json());
      setMessage(t('sharing.saved'));
    } catch (e) {
      logError('Sharing update failed', e);
      setError(t('sharing.saveError'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {detailedAlliance !== null && (
        <AllianceIntelShareModal
          opened={opened}
          onClose={() => setDetailedAlliance(null)}
          allianceId={detailedAlliance}
          attackLogId={logId}
          canReportThreat={state?.canReportThreat ?? false}
          onShared={() => {
            setDetailedAlliance(null);
            setReload((n) => n + 1);
          }}
        />
      )}
      <Modal
        opened={opened && detailedAlliance === null}
        onClose={onClose}
        title={t('sharing.title')}
        size="lg"
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
      >
        <Stack>
          {state ? (
            <ReportSharingControls
              state={state}
              players={players}
              searching={searching || search !== term}
              search={search}
              onSearch={setSearch}
              onAction={onAction}
              onAllianceDetails={setDetailedAlliance}
              busy={busy}
              error={error || searchError}
            />
          ) : error ? (
            <>
              <Text role="alert" c="red">
                {error}
              </Text>
              <Button onClick={() => setReload((n) => n + 1)}>
                {t('sharing.retry')}
              </Button>
            </>
          ) : (
            <Loader aria-label={t('sharing.loading')} />
          )}
          <Text role="status" size="sm">
            {message}
          </Text>
          <Group justify="space-between">
            <Button
              variant="light"
              disabled={!state}
              onClick={async () => {
                try {
                  const url = new URL(
                    `/battle/results/${logId}`,
                    window.location.origin,
                  );
                  await navigator.clipboard.writeText(url.href);
                  setMessage(t('sharing.copied'));
                } catch {
                  setError(t('sharing.copyError'));
                }
              }}
            >
              {t('sharing.copyLink')}
            </Button>
            <Button variant="default" onClick={onClose} disabled={busy}>
              {t('sharing.done')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
