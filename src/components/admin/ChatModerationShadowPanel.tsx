import {
  Badge,
  Button,
  Group,
  Loader,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

const PAGE_SIZE = 25;
const ACTIONS = ['allow', 'flag', 'would_block', 'error'] as const;
type Action = (typeof ACTIONS)[number];
type Outcome = 'correct' | 'false_positive' | 'false_negative';

interface VerdictRow {
  id: number;
  messageId: number;
  provider: string;
  model: string;
  roomType: string;
  harassment: number | null;
  severity: number | null;
  spam: number | null;
  recommendedAction: string | null;
  policyAction: Action;
  error: string | null;
  createdAt: string;
  reviewOutcome: Outcome | null;
  excerpt: string;
}

interface Summary {
  days: number;
  counts: Record<Action, number>;
  reviewed: number;
  falsePositives: number;
  falsePositiveRate: number | null;
}

const actionColor: Record<Action, string> = {
  allow: 'gray',
  flag: 'yellow',
  would_block: 'red',
  error: 'dark',
};

const percent = (value: number | null) =>
  value === null ? '—' : `${Math.round(value * 100)}%`;

/**
 * Staff view of shadow-mode chat moderation: verdicts a decision model gave
 * on recent messages, what our policy would have done, and a review control
 * so the false-positive rate can be measured. Read-only for the game: nothing
 * here hides, deletes or sanctions a message or a player.
 */
export default function ChatModerationShadowPanel() {
  const { t } = useTranslation('admin-abuse');
  const { user } = useUser();
  const canReview = Boolean(
    user?.permissions?.some(
      (permission) => permission.type === 'MODERATE_CHAT',
    ),
  );
  const [action, setAction] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [verdicts, setVerdicts] = useState<VerdictRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String((page - 1) * PAGE_SIZE),
    });
    if (action) params.set('policyAction', action);
    try {
      const response = await fetch(
        `/api/admin/moderation/shadow?${params.toString()}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setVerdicts(data.verdicts ?? []);
      setTotal(data.total ?? 0);
      setSummary(data.summary ?? null);
      setLoadError(false);
    } catch (error) {
      logError('Failed to load shadow moderation verdicts', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [action, page]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (verdictId: number, outcome: Outcome) => {
    setSavingId(verdictId);
    try {
      const response = await fetch('/api/admin/moderation/shadow/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdictId, outcome }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      alertService.notify('success', t('chatShadow.reviewSaved'), {
        title: t('chatShadow.updated'),
      });
      await load();
    } catch (error) {
      logError('Failed to save shadow moderation review', error);
      alertService.notify('error', t('chatShadow.reviewFailed'), {
        title: t('chatShadow.error'),
      });
    } finally {
      setSavingId(null);
    }
  };

  const renderReview = (row: VerdictRow) => {
    if (row.policyAction === 'error') return '—';
    const flagged = row.policyAction !== 'allow';
    return (
      <Stack gap={4}>
        {row.reviewOutcome && (
          <Badge variant="light" style={{ minWidth: 'max-content' }}>
            {t(`chatShadow.outcome_${row.reviewOutcome}`)}
          </Badge>
        )}
        {canReview && (
          <Group gap={4} wrap="wrap">
            <Button
              size="compact-xs"
              variant="default"
              loading={savingId === row.id}
              onClick={() => review(row.id, 'correct')}
            >
              {t('chatShadow.markCorrect')}
            </Button>
            <Button
              size="compact-xs"
              variant="default"
              color={flagged ? 'red' : 'orange'}
              loading={savingId === row.id}
              onClick={() =>
                review(row.id, flagged ? 'false_positive' : 'false_negative')
              }
            >
              {t(
                flagged
                  ? 'chatShadow.markFalsePositive'
                  : 'chatShadow.markFalseNegative',
              )}
            </Button>
          </Group>
        )}
      </Stack>
    );
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t('chatShadow.intro')}
      </Text>
      {summary && (
        <Paper withBorder p="sm">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {t('chatShadow.summaryTitle', { days: summary.days })}
            </Text>
            <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }}>
              {ACTIONS.map((key) => (
                <div key={key}>
                  <Text size="xs" c="dimmed">
                    {t(`chatShadow.count_${key}`)}
                  </Text>
                  <Text fw={700}>{summary.counts[key].toLocaleString()}</Text>
                </div>
              ))}
              <div>
                <Text size="xs" c="dimmed">
                  {t('chatShadow.reviewed')}
                </Text>
                <Text fw={700}>{summary.reviewed.toLocaleString()}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  {t('chatShadow.falsePositiveRate')}
                </Text>
                <Text fw={700}>
                  {summary.falsePositiveRate === null
                    ? t('chatShadow.noReviews')
                    : percent(summary.falsePositiveRate)}
                </Text>
              </div>
            </SimpleGrid>
          </Stack>
        </Paper>
      )}
      <Select
        label={t('chatShadow.filterAction')}
        placeholder={t('chatShadow.allActions')}
        clearable
        w={240}
        value={action}
        data={ACTIONS.map((key) => ({
          value: key,
          label: t(`chatShadow.action_${key}`),
        }))}
        onChange={(value) => {
          setAction(value);
          setPage(1);
        }}
      />
      {loading ? (
        <Loader size="sm" />
      ) : loadError ? (
        <Text c="red" role="alert">
          {t('chatShadow.loadError')}
        </Text>
      ) : verdicts.length === 0 ? (
        <Text c="dimmed">{t('chatShadow.empty')}</Text>
      ) : (
        <AdminDataTable size="wide" ariaLabel={t('chatShadow.tableLabel')}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('chatShadow.when')}</Table.Th>
              <Table.Th>{t('chatShadow.message')}</Table.Th>
              <Table.Th>{t('chatShadow.room')}</Table.Th>
              <Table.Th>{t('chatShadow.harassment')}</Table.Th>
              <Table.Th>{t('chatShadow.severity')}</Table.Th>
              <Table.Th>{t('chatShadow.spam')}</Table.Th>
              <Table.Th>{t('chatShadow.recommended')}</Table.Th>
              <Table.Th>{t('chatShadow.policy')}</Table.Th>
              <Table.Th>{t('chatShadow.source')}</Table.Th>
              <Table.Th>{t('chatShadow.review')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {verdicts.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>{new Date(row.createdAt).toLocaleString()}</Table.Td>
                <Table.Td maw={320}>
                  <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                    {row.excerpt}
                  </Text>
                </Table.Td>
                <Table.Td>{t(`chatShadow.room_${row.roomType}`)}</Table.Td>
                <Table.Td>{percent(row.harassment)}</Table.Td>
                <Table.Td>
                  {row.severity === null
                    ? '—'
                    : `${row.severity.toFixed(1)} · ${t(
                        `chatShadow.severity_${Math.min(3, Math.max(0, Math.round(row.severity)))}`,
                      )}`}
                </Table.Td>
                <Table.Td>{percent(row.spam)}</Table.Td>
                <Table.Td>
                  {row.recommendedAction
                    ? t(`chatShadow.action_${row.recommendedAction}`)
                    : '—'}
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={actionColor[row.policyAction] ?? 'gray'}
                    style={{ minWidth: 'max-content' }}
                  >
                    {t(`chatShadow.action_${row.policyAction}`)}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs">{row.provider}</Text>
                  <Text size="xs" c="dimmed">
                    {row.model}
                  </Text>
                </Table.Td>
                <Table.Td>{renderReview(row)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </AdminDataTable>
      )}
      {total > PAGE_SIZE && (
        <Pagination
          total={Math.ceil(total / PAGE_SIZE)}
          value={page}
          onChange={setPage}
        />
      )}
    </Stack>
  );
}
