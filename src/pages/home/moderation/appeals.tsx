import {
  Button,
  Group,
  Loader,
  Pagination,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

const AppealsReviewPage = () => {
  const [appeals, setAppeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<
    Record<number, { status: string; summary: string }>
  >({});
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [pendingAcceptance, setPendingAcceptance] = useState<number | null>(
    null,
  );
  const { t } = useTranslation('moderation-admin');
  const limit = 20;

  const fetchAppeals = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String((page - 1) * limit),
      });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/appeals?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAppeals(data.appeals || []);
      setTotal(data.total || 0);
      setLoadError(false);
    } catch (err) {
      logError('Failed to load appeals:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppeals();
  }, [page, statusFilter]);

  const decide = async (appealId: number) => {
    const decision = decisions[appealId];
    if (!decision?.status) {
      alertService.notify('error', 'Select a decision first.', {
        title: 'Error',
      });
      return;
    }
    setDecidingId(appealId);
    try {
      const res = await fetch(`/api/admin/moderation/appeals/${appealId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error(result.error || `HTTP ${res.status}`);
      }
      alertService.notify('success', t('decisionRecorded'), {
        title: t('success'),
      });
      setPendingAcceptance(null);
      await fetchAppeals();
    } catch (error) {
      alertService.notify(
        'error',
        error instanceof Error ? error.message : t('requestFailed'),
        { title: t('error') },
      );
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <AdminLayout title={t('banAppeals')} permissions={['MANAGE_BAN_APPEALS']}>
      <Stack gap="md">
        <Group justify="flex-end">
          <Select
            aria-label={t('filterByStatus')}
            placeholder={t('allStatuses')}
            clearable
            data={['OPEN', 'IN_REVIEW', 'ACCEPTED', 'DENIED', 'WITHDRAWN']}
            value={statusFilter}
            onChange={(value) => {
              setPage(1);
              setStatusFilter(value);
            }}
          />
        </Group>
        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : loadError ? (
          <Stack align="center">
            <Text role="alert" c="red">
              {t('loadFailed')}
            </Text>
            <Button onClick={fetchAppeals}>{t('retry')}</Button>
          </Stack>
        ) : appeals.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">
            No appeals.
          </Text>
        ) : (
          appeals.map((a) => (
            <GameCard
              key={a.id}
              title={`${a.user?.display_name || 'N/A'} (ID: ${a.userId}) — ${a.status}`}
            >
              <Stack>
                <Text size="sm" c="dimmed">
                  Submitted: {new Date(a.createdAt).toLocaleString()}
                </Text>
                {a.subject && <Text fw={700}>{a.subject}</Text>}
                <Paper p="md" withBorder>
                  <Text style={{ whiteSpace: 'pre-wrap' }}>{a.body}</Text>
                </Paper>

                {a.status === 'OPEN' || a.status === 'IN_REVIEW' ? (
                  <Group align="flex-end">
                    <Select
                      label="Decision"
                      data={['ACCEPTED', 'DENIED', 'IN_REVIEW']}
                      value={decisions[a.id]?.status}
                      onChange={(v) =>
                        setDecisions((prev) => ({
                          ...prev,
                          [a.id]: { ...prev[a.id], status: v || '' },
                        }))
                      }
                      style={{ width: 200 }}
                    />
                    <Textarea
                      label="Summary (optional)"
                      value={decisions[a.id]?.summary || ''}
                      onChange={(e) =>
                        setDecisions((prev) => ({
                          ...prev,
                          [a.id]: {
                            ...prev[a.id],
                            summary: e.currentTarget.value,
                          },
                        }))
                      }
                      style={{ flex: 1 }}
                    />
                    <Button
                      onClick={() =>
                        decisions[a.id]?.status === 'ACCEPTED'
                          ? setPendingAcceptance(a.id)
                          : decide(a.id)
                      }
                      loading={decidingId === a.id}
                    >
                      Record Decision
                    </Button>
                  </Group>
                ) : (
                  <Paper p="sm" withBorder>
                    <Text size="sm" c="dimmed">
                      Decision Summary:
                    </Text>
                    <Text>{a.decisionSummary || 'No summary'}</Text>
                  </Paper>
                )}
              </Stack>
            </GameCard>
          ))
        )}
        {total > limit && (
          <Pagination
            value={page}
            onChange={setPage}
            total={Math.ceil(total / limit)}
            mx="auto"
          />
        )}
      </Stack>
      <ConfirmationModal
        isOpen={pendingAcceptance !== null}
        onClose={() => {
          if (decidingId === null) setPendingAcceptance(null);
        }}
        onConfirm={() => {
          if (pendingAcceptance !== null) decide(pendingAcceptance);
        }}
        title={t('confirmAcceptance')}
        message={t('acceptanceLiftsPenalty')}
        type="positive"
        confirmText={t('acceptAppeal')}
        cancelText={t('cancel')}
        isLoading={
          pendingAcceptance !== null && decidingId === pendingAcceptance
        }
      />
    </AdminLayout>
  );
};

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(context.locale ?? 'en', [
        'common',
        'home',
        'navigation',
        'moderation-admin',
      ])),
    },
  };
};

export default AppealsReviewPage;
