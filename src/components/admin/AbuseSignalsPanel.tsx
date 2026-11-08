import {
  Anchor,
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Modal,
  Pagination,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

const PAGE_SIZE = 25;
const NOTE_MAX_LENGTH = 1000;
const SIGNAL_TYPES = [
  'LINKED_ACCOUNT_ACTIVITY',
  'RESOURCE_FUNNELLING',
  'BOT_TIMING',
  'FRESH_ACCOUNT_FARMING',
  'DEFECTOR_FARMING',
  'IMPOSSIBLE_ACTION',
  'GOLD_SPIKE',
  'SELF_FARMING',
  'TRANSFER_RING',
  'CHAT_SPAM',
  'ALLIANCE_BANK_ABUSE',
] as const;
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const STATUSES = ['OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'ACTION_TAKEN'] as const;
type ReviewAction = 'acknowledge' | 'dismiss' | 'takeAction';

interface NamedUser {
  id: number;
  display_name: string | null;
}
interface SignalRow {
  id: number;
  userId: number;
  type: string;
  severity: string;
  score: number;
  status: string;
  summary: string;
  evidence: Record<string, unknown>;
  reviewNote: string | null;
  lastSeenAt: string;
  firstSeenAt: string;
  user: NamedUser | null;
  relatedUser: NamedUser | null;
  assignedTo: NamedUser | null;
  resolvedBy: NamedUser | null;
  linkedUsers: NamedUser[];
}
interface EvidenceSource {
  userId: number;
  gold?: number;
  count?: number;
  sharePercent?: number;
}

const severityColor = (severity: string) =>
  ({ CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'yellow', LOW: 'gray' })[
    severity
  ] ?? 'gray';
const statusColor = (status: string) =>
  ({
    OPEN: 'blue',
    ACKNOWLEDGED: 'teal',
    DISMISSED: 'gray',
    ACTION_TAKEN: 'green',
  })[status] ?? 'gray';

/** Evidence keys rendered by their own blocks rather than as plain facts. */
const STRUCTURED_EVIDENCE = new Set([
  'kind',
  'reasons',
  'sources',
  'thresholds',
  'forward',
  'backward',
  'sharedLoginSources',
]);

/**
 * Staff view of abuse signals: filter by type, severity, status and player,
 * read the evidence, and mark a signal reviewed or dismissed with a note.
 * With `userId` it lists just that player's signals (Edit Player). Signals
 * are for review only; nothing here sanctions an account.
 */
export default function AbuseSignalsPanel({
  userId,
  compact = false,
}: {
  userId?: number;
  compact?: boolean;
}) {
  const { t } = useTranslation('admin-abuse');
  const { user } = useUser();
  const router = useRouter();
  const queryPlayer =
    typeof router.query.userId === 'string' ? router.query.userId : '';
  const canAct = Boolean(
    user?.permissions?.some(
      (permission) => permission.type === 'MANAGE_ACCOUNT_STATUS',
    ),
  );
  const [type, setType] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    compact || queryPlayer ? null : 'OPEN',
  );
  const [player, setPlayer] = useState(queryPlayer);
  const [page, setPage] = useState(1);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [names, setNames] = useState<Record<number, string>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [review, setReview] = useState<{
    signal: SignalRow;
    action: ReviewAction;
  } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const playerFilter = userId ? String(userId) : player.trim();
  const playerInvalid = playerFilter !== '' && !/^\d{1,10}$/.test(playerFilter);

  const load = useCallback(async () => {
    if (playerInvalid) return;
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
    });
    if (type) params.set('type', type);
    if (severity) params.set('severity', severity);
    if (status) params.set('status', status);
    if (playerFilter) params.set('userId', playerFilter);
    try {
      const response = await fetch(
        `/api/admin/abuse/cheat-signals?${params.toString()}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setSignals(data.signals ?? []);
      setNames(data.names ?? {});
      setTotal(data.total ?? 0);
      setLoadError(false);
    } catch (error) {
      logError('Failed to load abuse signals', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [type, severity, status, playerFilter, playerInvalid, page]);

  useEffect(() => {
    load();
  }, [load]);

  const changeFilter =
    (setter: (value: string | null) => void) => (v: string | null) => {
      setter(v);
      setPage(1);
    };

  const openReview = (signal: SignalRow, action: ReviewAction) => {
    setReview({ signal, action });
    setNote('');
  };

  const submitReview = async () => {
    if (!review) return;
    const trimmed = note.trim();
    if (review.action === 'dismiss' && !trimmed) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/admin/abuse/cheat-signals/${review.action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signalId: review.signal.id,
            ...(trimmed ? { note: trimmed } : {}),
          }),
        },
      );
      if (response.status === 409) {
        alertService.notify('error', t('stateChanged'), { title: t('error') });
      } else if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      } else {
        alertService.notify('success', t('signalUpdated'), {
          title: t('updated'),
        });
      }
      setReview(null);
      await load();
    } catch (error) {
      logError('Failed to update abuse signal', error);
      alertService.notify('error', t('actionFailed'), { title: t('error') });
    } finally {
      setSaving(false);
    }
  };

  const nameOf = (id: number, fallback?: string | null) =>
    fallback ?? names[id] ?? t('userNumber', { id });
  const playerLink = (id: number, name?: string | null) => (
    <Anchor
      component={Link}
      href={`/home/admin?userId=${id}`}
      size="sm"
      aria-label={t('openPlayer', { name: nameOf(id, name) })}
    >
      {nameOf(id, name)} ({t('id')}: {id})
    </Anchor>
  );

  const renderValue = (value: unknown) =>
    typeof value === 'boolean'
      ? t(value ? 'yes' : 'no')
      : typeof value === 'number' || typeof value === 'string'
        ? String(value)
        : JSON.stringify(value);

  const renderEvidence = (signal: SignalRow) => {
    const evidence = signal.evidence ?? {};
    const facts = Object.entries(evidence).filter(
      ([key, value]) =>
        !STRUCTURED_EVIDENCE.has(key) && value !== null && value !== undefined,
    );
    const reasons = Array.isArray(evidence.reasons)
      ? (evidence.reasons as string[])
      : [];
    const sources = Array.isArray(evidence.sources)
      ? (evidence.sources as EvidenceSource[])
      : [];
    const sharedSources = new Set(
      Array.isArray(evidence.sharedLoginSources)
        ? (evidence.sharedLoginSources as number[])
        : [],
    );
    const directions = (['forward', 'backward'] as const)
      .map((key) => [key, evidence[key]] as const)
      .filter(([, value]) => value && typeof value === 'object') as Array<
      [
        string,
        { fromUserId: number; toUserId: number; gold: number; count: number },
      ]
    >;
    return (
      <Stack gap="xs" p="xs">
        {reasons.length > 0 && (
          <Group gap="xs" role="list" aria-label={t('reasonsLabel')}>
            {reasons.map((reason) => (
              <Badge key={reason} variant="light" role="listitem">
                {t(`reasons.${reason}`, { defaultValue: reason })}
              </Badge>
            ))}
          </Group>
        )}
        {facts.length > 0 && (
          <Table withRowBorders={false} verticalSpacing={2}>
            <Table.Tbody>
              {facts.map(([key, value]) => (
                <Table.Tr key={key}>
                  <Table.Th scope="row" w="40%">
                    {t(`evidenceFields.${key}`, { defaultValue: key })}
                  </Table.Th>
                  <Table.Td>
                    {key === 'via' || key === 'kind'
                      ? t(`via.${String(value)}`, {
                          defaultValue: String(value),
                        })
                      : renderValue(value)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {directions.length > 0 && (
          <Table withRowBorders={false} verticalSpacing={2}>
            <Table.Tbody>
              {directions.map(([key, direction]) => (
                <Table.Tr key={key}>
                  <Table.Td>
                    {t('direction', {
                      from: nameOf(direction.fromUserId),
                      to: nameOf(direction.toUserId),
                      count: direction.count,
                      gold: direction.gold.toLocaleString(),
                    })}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {sources.length > 0 && (
          <AdminDataTable size="compact" ariaLabel={t('sourcesLabel')}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('sourceAccount')}</Table.Th>
                <Table.Th>{t('sourceGold')}</Table.Th>
                <Table.Th>{t('sourceCount')}</Table.Th>
                <Table.Th>{t('sourceShare')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sources.map((source) => (
                <Table.Tr key={source.userId}>
                  <Table.Td>
                    {playerLink(source.userId)}
                    {sharedSources.has(source.userId) && (
                      <Badge ml="xs" size="xs" color="orange" variant="light">
                        {t('sharedLogin')}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>{source.gold ?? '—'}</Table.Td>
                  <Table.Td>{source.count ?? '—'}</Table.Td>
                  <Table.Td>
                    {source.sharePercent !== undefined
                      ? `${source.sharePercent}%`
                      : '—'}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </AdminDataTable>
        )}
        {evidence.thresholds && typeof evidence.thresholds === 'object' ? (
          <Text size="xs" c="dimmed">
            {t('thresholdsUsed')}{' '}
            <Code>{JSON.stringify(evidence.thresholds)}</Code>
          </Text>
        ) : null}
        {signal.reviewNote && (
          <Text size="sm">
            <strong>{t('reviewNote')}:</strong> {signal.reviewNote}
            {(signal.resolvedBy ?? signal.assignedTo) &&
              ` — ${(signal.resolvedBy ?? signal.assignedTo)?.display_name}`}
          </Text>
        )}
      </Stack>
    );
  };

  const typeOptions = SIGNAL_TYPES.map((value) => ({
    value,
    label: t(`signalTypes.${value}`),
  }));
  const severityOptions = SEVERITIES.map((value) => ({
    value,
    label: t(`severities.${value}`),
  }));
  const statusOptions = STATUSES.map((value) => ({
    value,
    label: t(`statuses.${value}`),
  }));
  const renderActions = (signal: SignalRow) => {
    const open = expanded === signal.id;
    const reviewable =
      signal.status === 'OPEN' || signal.status === 'ACKNOWLEDGED';
    return (
      <Group gap="xs" wrap="wrap">
        <Button
          size="xs"
          variant="default"
          aria-expanded={open}
          onClick={() => setExpanded(open ? null : signal.id)}
        >
          {t(open ? 'hideEvidence' : 'showEvidence')}
        </Button>
        {canAct && reviewable && (
          <>
            {signal.status === 'OPEN' && (
              <Button
                size="xs"
                variant="default"
                onClick={() => openReview(signal, 'acknowledge')}
              >
                {t('markReviewed')}
              </Button>
            )}
            <Button
              size="xs"
              color="red"
              variant="subtle"
              onClick={() => openReview(signal, 'dismiss')}
            >
              {t('dismiss')}
            </Button>
            <Button
              size="xs"
              color="green"
              variant="subtle"
              onClick={() => openReview(signal, 'takeAction')}
            >
              {t('markActionTaken')}
            </Button>
          </>
        )}
      </Group>
    );
  };

  const renderLinked = (signal: SignalRow) => (
    <>
      {signal.linkedUsers.length === 0 ? (
        <Text size="sm" c="dimmed">
          —
        </Text>
      ) : (
        <Stack gap={2}>
          {signal.linkedUsers.slice(0, 5).map((linked) => (
            <div key={linked.id}>
              {playerLink(linked.id, linked.display_name)}
            </div>
          ))}
          {signal.linkedUsers.length > 5 && (
            <Text size="xs" c="dimmed">
              {t('moreLinked', {
                count: signal.linkedUsers.length - 5,
              })}
            </Text>
          )}
        </Stack>
      )}
    </>
  );

  const renderCard = (signal: SignalRow) => (
    <Paper key={signal.id} withBorder p="sm">
      <Stack gap="xs">
        <Group gap="xs" wrap="wrap">
          <Badge
            color={severityColor(signal.severity)}
            style={{ minWidth: 'max-content' }}
          >
            {t(`severities.${signal.severity}`)}
          </Badge>
          <Text fw={600} size="sm">
            {t(`signalTypes.${signal.type}`, {
              defaultValue: signal.type.replace(/_/g, ' '),
            })}
          </Text>
          <Badge
            variant="light"
            color={statusColor(signal.status)}
            style={{ minWidth: 'max-content' }}
          >
            {t(`statuses.${signal.status}`)}
          </Badge>
          <Text size="xs" c="dimmed">
            {new Date(signal.lastSeenAt).toLocaleString()}
          </Text>
        </Group>
        <Text size="sm">{signal.summary}</Text>
        {signal.linkedUsers.length > 0 && (
          <Group gap="xs" align="flex-start" wrap="wrap">
            <Text size="xs" c="dimmed">
              {t('linkedAccounts')}:
            </Text>
            <Stack gap={2}>{renderLinked(signal)}</Stack>
          </Group>
        )}
        {renderActions(signal)}
        {expanded === signal.id && renderEvidence(signal)}
      </Stack>
    </Paper>
  );

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Stack gap="md">
      {!compact && (
        <Text size="sm" c="dimmed">
          {t('signalsIntro')}
        </Text>
      )}
      <Group align="flex-end" gap="sm" wrap="wrap">
        <Select
          label={t('filterType')}
          placeholder={t('all')}
          data={typeOptions}
          value={type}
          onChange={changeFilter(setType)}
          clearable
          w={230}
        />
        <Select
          label={t('filterSeverity')}
          placeholder={t('all')}
          data={severityOptions}
          value={severity}
          onChange={changeFilter(setSeverity)}
          clearable
          w={150}
        />
        <Select
          label={t('filterStatus')}
          placeholder={t('all')}
          data={statusOptions}
          value={status}
          onChange={changeFilter(setStatus)}
          clearable
          w={170}
        />
        {!userId && (
          <TextInput
            label={t('filterPlayer')}
            description={t('filterPlayerHelp')}
            value={player}
            onChange={(event) => {
              setPlayer(event.currentTarget.value);
              setPage(1);
            }}
            error={playerInvalid ? t('filterPlayerInvalid') : undefined}
            inputMode="numeric"
            w={190}
          />
        )}
      </Group>

      {loading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : loadError ? (
        <Group justify="center" py="md" role="alert">
          <Text c="red">{t('loadFailed')}</Text>
          <Button variant="default" onClick={() => load()}>
            {t('retry')}
          </Button>
        </Group>
      ) : signals.length === 0 ? (
        <Text c="dimmed" ta="center" py="md">
          {t('noSignals')}
        </Text>
      ) : (
        <>
          <Text size="sm" c="dimmed" aria-live="polite">
            {t('signalCount', { count: total })}
          </Text>
          {compact ? (
            <Stack gap="sm">{signals.map(renderCard)}</Stack>
          ) : (
            <AdminDataTable size="wide" ariaLabel={t('signalsTable')}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('severity')}</Table.Th>
                  <Table.Th>{t('type')}</Table.Th>
                  <Table.Th>{t('user')}</Table.Th>
                  <Table.Th>{t('linkedAccounts')}</Table.Th>
                  <Table.Th>{t('summary')}</Table.Th>
                  <Table.Th>{t('lastSeen')}</Table.Th>
                  <Table.Th>{t('status')}</Table.Th>
                  <Table.Th>{t('actions')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {signals.flatMap((signal) => {
                  const open = expanded === signal.id;
                  const rows = [
                    <Table.Tr key={signal.id}>
                      <Table.Td>
                        <Badge
                          color={severityColor(signal.severity)}
                          style={{ minWidth: 'max-content' }}
                        >
                          {t(`severities.${signal.severity}`)}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {t('score')}: {signal.score}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {t(`signalTypes.${signal.type}`, {
                          defaultValue: signal.type.replace(/_/g, ' '),
                        })}
                      </Table.Td>
                      <Table.Td>
                        {playerLink(signal.userId, signal.user?.display_name)}
                      </Table.Td>
                      <Table.Td style={{ maxWidth: 220 }}>
                        {renderLinked(signal)}
                      </Table.Td>
                      <Table.Td style={{ maxWidth: 320 }}>
                        {signal.summary}
                      </Table.Td>
                      <Table.Td>
                        {new Date(signal.lastSeenAt).toLocaleString()}
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          color={statusColor(signal.status)}
                          style={{ minWidth: 'max-content' }}
                        >
                          {t(`statuses.${signal.status}`)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{renderActions(signal)}</Table.Td>
                    </Table.Tr>,
                  ];
                  if (open)
                    rows.push(
                      <Table.Tr key={`${signal.id}-evidence`}>
                        <Table.Td colSpan={8}>
                          {renderEvidence(signal)}
                        </Table.Td>
                      </Table.Tr>,
                    );
                  return rows;
                })}
              </Table.Tbody>
            </AdminDataTable>
          )}
          {pages > 1 && (
            <Pagination
              value={page}
              onChange={setPage}
              total={pages}
              aria-label={t('pagination')}
            />
          )}
        </>
      )}

      <Modal
        opened={review !== null}
        onClose={() => setReview(null)}
        title={review ? t(`reviewTitle.${review.action}`) : ''}
      >
        {review && (
          <Stack gap="sm">
            <Text size="sm">{review.signal.summary}</Text>
            <Textarea
              label={t('reviewNote')}
              description={
                review.action === 'dismiss'
                  ? t('dismissNoteRequired')
                  : t('reviewNoteOptional')
              }
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              maxLength={NOTE_MAX_LENGTH}
              minRows={3}
              autosize
              required={review.action === 'dismiss'}
              data-autofocus
            />
            <Text size="xs" c="dimmed">
              {t('noPenaltyNote')}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setReview(null)}>
                {t('cancel')}
              </Button>
              <Button
                onClick={() => submitReview()}
                loading={saving}
                disabled={review.action === 'dismiss' && !note.trim()}
              >
                {t('confirm')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
