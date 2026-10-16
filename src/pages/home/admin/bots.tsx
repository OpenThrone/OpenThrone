import {
  Alert,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { isAdmin, isImpersonatedSession } from '@/utils/authorization';

interface BotEntry {
  id: number;
  display_name: string;
  email: string;
  race: string;
  class: string;
  botPersona: string | null;
  botCreatedAt: string | null;
  botLastRunAt: string | null;
  botStats: unknown;
  gold: string | number;
}

interface BotReport {
  total: number;
  bots: BotEntry[];
  manifests: string[];
  schedules: string[];
}

type PendingAction = 'provision' | 'run';

interface BotsPageProps {
  canManageBots: boolean;
}

const BotsPage = ({ canManageBots }: BotsPageProps) => {
  const { t } = useTranslation('admin-operations');
  const [report, setReport] = useState<BotReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<string | null>('default');
  const [schedule, setSchedule] = useState<string | null>('default');
  const [pending, setPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<unknown>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/admin/bots/status');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : t('bots.loadFailed'),
        );
      }
      setReport({
        total: Number(data.total) || 0,
        bots: Array.isArray(data.bots) ? data.bots : [],
        manifests: Array.isArray(data.manifests) ? data.manifests : [],
        schedules: Array.isArray(data.schedules) ? data.schedules : [],
      });
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : t('bots.loadFailed'),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (canManageBots) loadStatus().catch(() => undefined);
  }, [canManageBots, loadStatus]);

  const submitAction = async (action: PendingAction | 'dry-run') => {
    setPending(true);
    setActionError(null);
    setActionResult(null);
    try {
      const response = await fetch(
        action === 'run'
          ? '/api/admin/bots/run-now'
          : '/api/admin/bots/provision',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            action === 'run'
              ? { schedule: schedule ?? undefined }
              : {
                  manifest: manifest ?? undefined,
                  dryRun: action === 'dry-run',
                },
          ),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : t('bots.actionFailed'),
        );
      }
      setActionResult(data);
      setPendingAction(null);
      notifications.show({
        title: t('bots.actionComplete'),
        message:
          typeof data.message === 'string' ? data.message : t('bots.saved'),
        color: 'green',
      });
      await loadStatus();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : t('bots.actionFailed'),
      );
    } finally {
      setPending(false);
    }
  };

  const closeConfirmation = () => {
    if (!pending) setPendingAction(null);
  };

  return (
    <AdminLayout title={t('bots.title')}>
      {!canManageBots ? (
        <Alert color="red" role="alert" title={t('bots.accessDenied')}>
          {t('bots.accessDeniedDescription')}
        </Alert>
      ) : (
        <Stack gap="md">
          <Group justify="space-between" align="end">
            <Text size="sm" c="dimmed">
              {t('bots.description')}
            </Text>
            <Button
              variant="default"
              onClick={() => loadStatus().catch(() => undefined)}
              loading={loading}
            >
              {t('bots.refresh')}
            </Button>
          </Group>

          {loadError && (
            <Alert color="red" role="alert" title={t('bots.errorTitle')}>
              <Stack gap="xs">
                <Text size="sm">{loadError}</Text>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => loadStatus().catch(() => undefined)}
                >
                  {t('bots.retry')}
                </Button>
              </Stack>
            </Alert>
          )}

          <GameCard title={t('bots.rosterTitle')}>
            {loading && !report ? (
              <Text role="status">{t('bots.loading')}</Text>
            ) : report?.bots.length ? (
              <>
                <Text size="sm" mb="sm">
                  {t('bots.total', { count: report.total })}
                </Text>
                <div style={{ overflowX: 'auto' }}>
                  <Table striped highlightOnHover miw={680}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t('bots.columns.id')}</Table.Th>
                        <Table.Th>{t('bots.columns.name')}</Table.Th>
                        <Table.Th>{t('bots.columns.raceClass')}</Table.Th>
                        <Table.Th>{t('bots.columns.persona')}</Table.Th>
                        <Table.Th>{t('bots.columns.lastRun')}</Table.Th>
                        <Table.Th>{t('bots.columns.gold')}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {report.bots.map((bot) => (
                        <Table.Tr key={bot.id}>
                          <Table.Td>{bot.id}</Table.Td>
                          <Table.Td style={{ overflowWrap: 'anywhere' }}>
                            {bot.display_name}
                          </Table.Td>
                          <Table.Td>
                            {bot.race} / {bot.class}
                          </Table.Td>
                          <Table.Td>{bot.botPersona ?? '—'}</Table.Td>
                          <Table.Td>
                            {bot.botLastRunAt
                              ? new Intl.DateTimeFormat(undefined, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                }).format(new Date(bot.botLastRunAt))
                              : t('bots.neverRun')}
                          </Table.Td>
                          <Table.Td>
                            {new Intl.NumberFormat().format(Number(bot.gold))}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </div>
              </>
            ) : (
              <Text c="dimmed">
                {loading ? t('bots.loading') : t('bots.empty')}
              </Text>
            )}
          </GameCard>

          {actionError && (
            <Alert color="red" role="alert" title={t('bots.errorTitle')}>
              {actionError}
            </Alert>
          )}
          {actionResult !== null && (
            <Paper withBorder p="md">
              <Title order={4} mb="xs">
                {t('bots.resultTitle')}
              </Title>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  margin: 0,
                }}
              >
                {JSON.stringify(actionResult, null, 2)}
              </pre>
            </Paper>
          )}

          <GameCard title={t('bots.controlsTitle')}>
            <Stack gap="md">
              <Select
                label={t('bots.manifestLabel')}
                description={t('bots.manifestDescription')}
                value={manifest}
                onChange={setManifest}
                data={(report?.manifests ?? []).map((value) => ({
                  value,
                  label: value,
                }))}
                disabled={loading || pending || !report?.manifests.length}
                searchable
                nothingFoundMessage={t('bots.noManifests')}
              />
              <Group wrap="wrap">
                <Button
                  variant="default"
                  onClick={() => submitAction('dry-run').catch(() => undefined)}
                  loading={pending}
                  disabled={!manifest || loading}
                >
                  {t('bots.dryRun')}
                </Button>
                <Button
                  color="red"
                  onClick={() => setPendingAction('provision')}
                  disabled={!manifest || loading || pending}
                >
                  {t('bots.provision')}
                </Button>
              </Group>

              <Select
                label={t('bots.scheduleLabel')}
                description={t('bots.scheduleDescription')}
                value={schedule}
                onChange={setSchedule}
                data={(report?.schedules ?? []).map((value) => ({
                  value,
                  label: value,
                }))}
                disabled={loading || pending || !report?.schedules.length}
                searchable
                nothingFoundMessage={t('bots.noSchedules')}
              />
              <Group justify="flex-end">
                <Button
                  color="red"
                  onClick={() => setPendingAction('run')}
                  disabled={!schedule || loading || pending}
                >
                  {t('bots.runNow')}
                </Button>
              </Group>
            </Stack>
          </GameCard>
        </Stack>
      )}

      <Modal
        opened={pendingAction !== null}
        onClose={closeConfirmation}
        centered
        title={
          pendingAction === 'provision'
            ? t('bots.confirmProvisionTitle')
            : t('bots.confirmRunTitle')
        }
        closeOnClickOutside={!pending}
        closeOnEscape={!pending}
      >
        <Stack>
          <Text size="sm">
            {pendingAction === 'provision'
              ? t('bots.confirmProvisionMessage', { manifest })
              : t('bots.confirmRunMessage', { schedule })}
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={closeConfirmation}
              disabled={pending}
            >
              {t('user.cancel')}
            </Button>
            <Button
              color="red"
              loading={pending}
              onClick={() =>
                pendingAction &&
                submitAction(pendingAction).catch(() => undefined)
              }
            >
              {pendingAction === 'provision'
                ? t('bots.provision')
                : t('bots.runNow')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AdminLayout>
  );
};

export const getServerSideProps: GetServerSideProps<BotsPageProps> = async (
  context,
) => {
  const [session, i18nProps] = await Promise.all([
    getServerSession(context.req, context.res, authOptions),
    serverSideTranslations(context.locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-operations',
      'admin-users',
    ]),
  ]);
  const userId = Number(session?.user?.id);
  let canManageBots = false;
  if (
    Number.isSafeInteger(userId) &&
    userId > 0 &&
    !isImpersonatedSession(session)
  ) {
    try {
      canManageBots = await isAdmin(userId);
    } catch {
      canManageBots = false;
    }
  }
  return { props: { ...i18nProps, canManageBots } };
};

export default BotsPage;
