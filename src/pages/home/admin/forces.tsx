import {
  Alert,
  Button,
  Group,
  Loader,
  NumberInput,
  Pagination,
  Select,
  Stack,
  Tabs,
} from '@mantine/core';
import type { GetServerSidePropsContext } from 'next';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useCallback, useEffect, useRef, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import {
  type AdminForceContract,
  type AdminForceObligation,
  type AdminForceReserve,
  type ForceAction,
  ForceActionModal,
  ForceContractsTable,
  ForceObligationsTable,
  ForceReservesTable,
} from '@/components/admin/ForceAdminTables';
import { GameCard } from '@/components/game/GameCard';
import { logError } from '@/utils/logger';

type Tab = 'contracts' | 'reserves' | 'obligations';

const LIMIT = 25;
const STATUSES = [
  'REQUESTED',
  'ACTIVE',
  'EXPIRED',
  'RECALLED',
  'DISMISSED',
  'DEPLETED',
  'CANCELLED',
];

const ForcesAdminPage = () => {
  const { t } = useTranslation('admin-forces');
  const [tab, setTab] = useState<Tab>('contracts');
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState<number | ''>('');
  const [allianceId, setAllianceId] = useState<number | ''>('');
  const [status, setStatus] = useState<string | null>('ACTIVE');
  const [kind, setKind] = useState<string | null>(null);
  const [state, setState] = useState<string>('open');
  const [filters, setFilters] = useState(0);
  const [rows, setRows] = useState<unknown[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [action, setAction] = useState<ForceAction | null>(null);

  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    // A slower, earlier request must not fill a tab the admin has left.
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String((page - 1) * LIMIT),
      });
      if (allianceId) params.set('allianceId', String(allianceId));
      if (tab !== 'reserves' && userId) params.set('userId', String(userId));
      if (tab === 'contracts') {
        if (status) params.set('status', status);
        if (kind) params.set('kind', kind);
      }
      if (tab === 'obligations') params.set('state', state);
      const res = await fetch(`/api/admin/forces/${tab}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (seq !== loadSeq.current) return;
      setRows(data[tab] ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      logError('Failed to load forces:', err);
      setLoadError(true);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
    // Filter fields apply on "Apply" (via `filters`), not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const changeTab = (value: string | null) => {
    if (!value) return;
    setRows([]);
    setPage(1);
    setTab(value as Tab);
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <AdminLayout
      title={t('title')}
      permissions={['MANAGE_USERS', 'MANAGE_ALLIANCES']}
    >
      <Stack gap="md">
        <Tabs value={tab} onChange={changeTab}>
          <Tabs.List>
            <Tabs.Tab value="contracts">{t('tabContracts')}</Tabs.Tab>
            <Tabs.Tab value="reserves">{t('tabReserves')}</Tabs.Tab>
            <Tabs.Tab value="obligations">{t('tabObligations')}</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        <GameCard title={t('filters')}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setFilters((n) => n + 1);
            }}
          >
            <Group align="flex-end">
              {tab !== 'reserves' && (
                <NumberInput
                  label={t('userId')}
                  value={userId}
                  min={1}
                  allowDecimal={false}
                  onChange={(v) => setUserId(typeof v === 'number' ? v : '')}
                />
              )}
              <NumberInput
                label={t('allianceId')}
                value={allianceId}
                min={1}
                allowDecimal={false}
                onChange={(v) => setAllianceId(typeof v === 'number' ? v : '')}
              />
              {tab === 'contracts' && (
                <>
                  <Select
                    label={t('status')}
                    placeholder={t('any')}
                    clearable
                    data={STATUSES}
                    value={status}
                    onChange={setStatus}
                  />
                  <Select
                    label={t('kind')}
                    placeholder={t('any')}
                    clearable
                    data={['MERCENARY', 'ALLIANCE']}
                    value={kind}
                    onChange={setKind}
                  />
                </>
              )}
              {tab === 'obligations' && (
                <Select
                  label={t('state')}
                  data={[
                    { value: 'open', label: t('open') },
                    { value: 'cancelled', label: t('cancelled') },
                    { value: 'all', label: t('all') },
                  ]}
                  value={state}
                  onChange={(v) => setState(v ?? 'open')}
                  allowDeselect={false}
                />
              )}
              <Button type="submit">{t('apply')}</Button>
            </Group>
          </form>
        </GameCard>

        <GameCard
          title={`${t(`tab${tab[0].toUpperCase()}${tab.slice(1)}`)} (${total})`}
        >
          {loadError && (
            <Alert color="red" title={t('loadError')} mb="md">
              <Button variant="default" size="xs" onClick={load}>
                {t('retry')}
              </Button>
            </Alert>
          )}
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : (
            <Stack gap="md">
              {tab === 'contracts' && (
                <ForceContractsTable
                  contracts={rows as AdminForceContract[]}
                  onAction={setAction}
                />
              )}
              {tab === 'reserves' && (
                <ForceReservesTable
                  reserves={rows as AdminForceReserve[]}
                  onAction={setAction}
                />
              )}
              {tab === 'obligations' && (
                <ForceObligationsTable
                  obligations={rows as AdminForceObligation[]}
                  onAction={setAction}
                />
              )}
              {totalPages > 1 && (
                <Group justify="center">
                  <Pagination
                    value={page}
                    onChange={setPage}
                    total={totalPages}
                  />
                </Group>
              )}
            </Stack>
          )}
        </GameCard>
      </Stack>
      <ForceActionModal
        action={action}
        onClose={() => setAction(null)}
        onDone={load}
      />
    </AdminLayout>
  );
};

/** Loads the translations the forces admin page renders. */
export const getServerSideProps = async (
  context: GetServerSidePropsContext,
) => ({
  props: {
    ...(await serverSideTranslations(context.locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-forces',
    ])),
  },
});

export default ForcesAdminPage;
