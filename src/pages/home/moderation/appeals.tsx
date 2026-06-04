import {
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { logError } from '@/utils/logger';

const AppealsReviewPage = () => {
  const [appeals, setAppeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [decisions, setDecisions] = useState<
    Record<number, { status: string; summary: string }>
  >({});

  const fetchAppeals = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/appeals');
      if (res.ok) setAppeals(await res.json());
    } catch (err) {
      logError('Failed to load appeals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppeals();
  }, []);

  const decide = async (appealId: number) => {
    const decision = decisions[appealId];
    if (!decision?.status) {
      notifications.show({
        title: 'Error',
        message: 'Select a decision first.',
        color: 'red',
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
      if (res.ok) {
        notifications.show({
          title: 'Decided',
          message: 'Appeal decision recorded.',
          color: 'green',
        });
        fetchAppeals();
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed.',
        color: 'red',
      });
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <AdminLayout
      title="Moderation: Ban Appeals"
      permissions={['MANAGE_BAN_APPEALS']}
    >
      <Stack gap="md">
        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
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
                      color="blue"
                      onClick={() => decide(a.id)}
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
      </Stack>
    </AdminLayout>
  );
};

export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(context.locale ?? 'en', [
        'common',
        'home',
        'navigation',
      ])),
    },
  };
};

export default AppealsReviewPage;
