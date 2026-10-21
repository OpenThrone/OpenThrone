import {
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import ResetCurrentEra from '@/components/admin/ResetCurrentEra';
import ScheduleEraReset from '@/components/admin/ScheduleEraReset';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { alertService } from '@/services/Alert.service';
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
    // The dialog only enables confirm once the era name is typed.
    if (!current || starting) return;
    setStarting(true);
    try {
      const res = await fetch('/api/admin/game/eras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedEraId: current.id,
          startSettings: {
            gold: String(gold),
            citizens: Number(citizens),
            attackTurns: Number(attackTurns),
          },
        }),
      });

      if (res.ok) {
        alertService.notify('success', t('eras.startedMessage'), {
          title: t('eras.startedTitle'),
        });
        setModalOpened(false);
        fetchEras();
      } else {
        const data = await res.json().catch(() => ({}));
        const errorMessage = data?.error || t('eras.startError');
        logError('Failed to start new era:', errorMessage);
        alertService.notify('error', errorMessage, {
          title: t('eras.errorTitle'),
        });
      }
    } catch (err) {
      logError('Failed to start new era:', err);
      alertService.notify('error', t('eras.startError'), {
        title: t('eras.errorTitle'),
      });
    } finally {
      setStarting(false);
    }
  };

  const current = eras.find((e) => !e.endDate);
  const past = eras.filter((e) => e.endDate);

  return (
    <AdminLayout title={t('eraTitle')} permissions={['MANAGE_ERAS']}>
      {/* Same safeguard as the other reset: type the era's name. */}
      <ConfirmationModal
        isOpen={canStartEra && modalOpened}
        onClose={() => {
          if (!starting) setModalOpened(false);
        }}
        onConfirm={startNewEra}
        title={t('eraStartConfirm.title')}
        message={t('eraStartConfirm.message')}
        type="destructive"
        confirmText={t('eraStartConfirm.confirm')}
        cancelText={t('cancel')}
        isLoading={starting}
        confirmDisabled={!current}
        requiredText={current?.name ?? ''}
        requiredTextLabel={t('eraStartConfirm.typeLabel', {
          name: current?.name ?? '',
        })}
      />

      <Stack gap="md">
        <GameCard title={t('eras.current')}>
          {current ? (
            <Paper p="md" withBorder>
              <Group justify="space-between">
                <div>
                  <Text fw={900} size="lg">
                    {current.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t('eras.startedOn', {
                      date: new Date(current.startDate).toLocaleString(),
                    })}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t('eras.playerCount', {
                      value: current.players ?? current._count?.userEras ?? '—',
                    })}
                  </Text>
                </div>
                <Badge color="green" size="lg">
                  {t('eras.active')}
                </Badge>
              </Group>
            </Paper>
          ) : (
            <Text c="dimmed">{t('eras.noActive')}</Text>
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
                  {t('eras.nextSettings')}
                </Text>
                <Group grow>
                  <NumberInput
                    label={t('eraReset.startGold')}
                    value={gold}
                    onChange={(val) => setGold(String(val ?? ''))}
                    min={0}
                    max={1_000_000_000_000}
                    allowNegative={false}
                    allowDecimal={false}
                    disabled={starting}
                  />
                  <NumberInput
                    label={t('eraReset.startCitizens')}
                    value={citizens}
                    onChange={(val) => setCitizens(val)}
                    min={0}
                    max={10_000_000}
                    allowNegative={false}
                    allowDecimal={false}
                    disabled={starting}
                  />
                  <NumberInput
                    label={t('eraReset.startAttackTurns')}
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
                  color="red"
                  onClick={() => setModalOpened(true)}
                  disabled={!current || starting}
                >
                  {t('eras.endAndStart')}
                </Button>
              </Group>
            </>
          )}
        </GameCard>

        <GameCard title={t('eras.past', { count: past.length })}>
          <AdminDataTable size="compact" ariaLabel={t('eras.pastLabel')}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('eras.name')}</Table.Th>
                <Table.Th>{t('eras.started')}</Table.Th>
                <Table.Th>{t('eras.ended')}</Table.Th>
                <Table.Th>{t('eras.players')}</Table.Th>
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
                  <Table.Td>{e.players ?? e._count?.userEras ?? '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </AdminDataTable>
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
