import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AdminLayout from '@/components/admin/AdminLayout';
import ResetCurrentEra from '@/components/admin/ResetCurrentEra';
import ScheduleEraReset from '@/components/admin/ScheduleEraReset';
import { GameCard } from '@/components/game/GameCard';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { isAdmin, isImpersonatedSession } from '@/utils/authorization';
import {
  DEFAULT_ERA_START_SETTINGS,
  resolveEraStartSettings,
} from '@/utils/eraStartSettings';
import { logError } from '@/utils/logger';

interface EraManagementPageProps {
  /** Starting an era is administrator-only; MANAGE_ERAS holders may only view. */
  canStartEra: boolean;
}

const EraManagementPage = ({ canStartEra }: EraManagementPageProps) => {
  const { t } = useTranslation('admin-game');
  const [eras, setEras] = useState<any[]>([]);
  const [starting, setStarting] = useState(false);
  const [modalOpened, setModalOpened] = useState(false);
  const [gold, setGold] = useState<string>(DEFAULT_ERA_START_SETTINGS.gold);
  const [citizens, setCitizens] = useState<number | string>(
    DEFAULT_ERA_START_SETTINGS.citizens,
  );
  const [attackTurns, setAttackTurns] = useState<number | string>(
    DEFAULT_ERA_START_SETTINGS.attackTurns,
  );

  const fetchEras = async () => {
    try {
      const res = await fetch('/api/admin/game/eras');
      if (res.ok) {
        const data = await res.json();
        setEras(data);
        if (data.length > 0) {
          const resolved = resolveEraStartSettings(data[0]?.startSettings);
          setGold(resolved.gold);
          setCitizens(resolved.citizens);
          setAttackTurns(resolved.attackTurns);
        }
      }
    } catch (err) {
      logError('Failed to load eras:', err);
    }
  };

  useEffect(() => {
    fetchEras();
  }, []);

  const startNewEra = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/admin/game/eras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startSettings: {
            gold: String(gold),
            citizens: Number(citizens),
            attackTurns: Number(attackTurns),
          },
        }),
      });

      if (res.ok) {
        notifications.show({
          title: 'New Era Started',
          message: 'A new game era has been initiated.',
          color: 'green',
        });
        setModalOpened(false);
        fetchEras();
      } else {
        const data = await res.json().catch(() => ({}));
        const errorMessage = data?.error || 'Failed to start new era.';
        logError('Failed to start new era:', errorMessage);
        notifications.show({
          title: 'Error',
          message: errorMessage,
          color: 'red',
        });
      }
    } catch (err) {
      logError('Failed to start new era:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to start new era.',
        color: 'red',
      });
    } finally {
      setStarting(false);
    }
  };

  const current = eras.find((e) => !e.endDate);
  const past = eras.filter((e) => e.endDate);

  return (
    <AdminLayout title={t('eraTitle')} permissions={['MANAGE_ERAS']}>
      <Modal
        opened={canStartEra && modalOpened}
        onClose={() => {
          if (!starting) setModalOpened(false);
        }}
        title="Confirm New Era"
      >
        <Text size="sm" mb="lg">
          Are you sure you want to start a new era? This resets every
          player&apos;s gold, units, structures and upgrades (messages, friends,
          enemies and alliances are kept).
        </Text>
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => setModalOpened(false)}
            disabled={starting}
          >
            Cancel
          </Button>
          <Button
            color="orange"
            onClick={startNewEra}
            loading={starting}
            disabled={starting}
          >
            Confirm & Start Era
          </Button>
        </Group>
      </Modal>

      <Stack gap="md">
        <GameCard title="Current Era">
          {current ? (
            <Paper p="md" withBorder>
              <Group justify="space-between">
                <div>
                  <Text fw={900} size="lg">
                    {current.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    Started: {new Date(current.startDate).toLocaleString()}
                  </Text>
                  <Text size="sm" c="dimmed">
                    Players: {current._count?.userEras ?? '—'}
                  </Text>
                </div>
                <Badge color="green" size="lg">
                  Active
                </Badge>
              </Group>
            </Paper>
          ) : (
            <Text c="dimmed">No active era.</Text>
          )}
          {!canStartEra && (
            <Text size="sm" c="dimmed" mt="md">
              {t('eraStartAdminOnly')}
            </Text>
          )}
          {current && (
            <ResetCurrentEra
              era={current}
              canReset={canStartEra}
              onReset={() => window.location.reload()}
            />
          )}
          {current && (
            <ScheduleEraReset era={current} canSchedule={canStartEra} />
          )}
          {canStartEra && (
            <>
              <Paper p="md" withBorder mt="md">
                <Text fw={700} mb="sm">
                  Next Era Starting Settings
                </Text>
                <Group grow>
                  <NumberInput
                    label="Starting Gold"
                    value={gold}
                    onChange={(val) => setGold(String(val ?? ''))}
                    min={0}
                    max={1_000_000_000_000}
                    allowNegative={false}
                    allowDecimal={false}
                    disabled={starting}
                  />
                  <NumberInput
                    label="Starting Citizens"
                    value={citizens}
                    onChange={(val) => setCitizens(val)}
                    min={0}
                    max={10_000_000}
                    allowNegative={false}
                    allowDecimal={false}
                    disabled={starting}
                  />
                  <NumberInput
                    label="Starting Attack Turns"
                    value={attackTurns}
                    onChange={(val) => setAttackTurns(val)}
                    min={0}
                    max={10_000}
                    allowNegative={false}
                    allowDecimal={false}
                    disabled={starting}
                  />
                </Group>
              </Paper>

              <Group mt="md" justify="flex-end">
                <Button
                  color="orange"
                  onClick={() => setModalOpened(true)}
                  disabled={!current || starting}
                >
                  End Current Era & Start New
                </Button>
              </Group>
            </>
          )}
        </GameCard>

        <GameCard title={`Past Eras (${past.length})`}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Started</Table.Th>
                <Table.Th>Ended</Table.Th>
                <Table.Th>Players</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {past.map((e) => (
                <Table.Tr key={e.id}>
                  <Table.Td>{e.name}</Table.Td>
                  <Table.Td>
                    {new Date(e.startDate).toLocaleDateString()}
                  </Table.Td>
                  <Table.Td>
                    {e.endDate ? new Date(e.endDate).toLocaleDateString() : '—'}
                  </Table.Td>
                  <Table.Td>{e._count?.userEras ?? '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </GameCard>
      </Stack>
    </AdminLayout>
  );
};

/** Resolves translations and whether the viewer may start an era. */
export const getServerSideProps: GetServerSideProps<
  EraManagementPageProps
> = async (context) => {
  const [session, i18nProps] = await Promise.all([
    getServerSession(context.req, context.res, authOptions),
    serverSideTranslations(context.locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-game',
    ]),
  ]);

  let canStartEra = false;
  const userId = Number(session?.user?.id);
  if (Number.isSafeInteger(userId) && userId > 0) {
    try {
      canStartEra = !isImpersonatedSession(session) && (await isAdmin(userId));
    } catch {
      canStartEra = false;
    }
  }

  return { props: { ...i18nProps, canStartEra } };
};

export default EraManagementPage;
