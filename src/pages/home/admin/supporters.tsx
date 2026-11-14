import {
  Badge,
  Button,
  Group,
  Loader,
  Pagination,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import AdminPlayerModal from '@/components/admin/AdminPlayerModal';
import AdminRequestState from '@/components/admin/AdminRequestState';
import { AllianceDetailDrawer } from '@/components/admin/AllianceDetailDrawer';
import {
  EventTable,
  MembershipTable,
  PlayerButton,
  StripePaymentLink,
  SupporterOverview,
} from '@/components/admin/supporters/SupporterAdminParts';
import SupporterPriceTable from '@/components/admin/supporters/SupporterPriceTable';
import { date, money } from '@/components/supporter/SupporterParts';
import { useUser } from '@/context/users';
import { PermissionType } from '@/lib/prisma-browser-exports';
import { alertService } from '@/services/Alert.service';
import type {
  AdminSupporterPlan,
  AllianceSponsorshipInfo,
  GiftCodeRecord,
  PaymentEventRow,
  PaymentRecord,
  SupporterAdminSummary,
  SupporterMembershipRow,
} from '@/types/supporter';
import { serverSideTranslations } from '@/utils/serverTranslations';

type Tab =
  | 'plans'
  | 'overview'
  | 'memberships'
  | 'payments'
  | 'events'
  | 'gifts'
  | 'alliances';
type Rows = {
  memberships: SupporterMembershipRow[];
  payments: (PaymentRecord & { userId: number; displayName: string })[];
  events: PaymentEventRow[];
  gifts: (GiftCodeRecord & {
    purchaserName: string;
    purchaserUserId: number;
    recipientUserId: number | null;
    redeemedByUserId: number | null;
  })[];
  alliances: (AllianceSponsorshipInfo & { name: string })[];
};

export default function SupportersPage() {
  const { t } = useTranslation('admin-supporters');
  const { user } = useUser();
  const isAdministrator = (user?.staffRoles ?? []).includes('ADMINISTRATOR');
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [allianceId, setAllianceId] = useState<number | null>(null);
  const can = (type: PermissionType) =>
    (user?.permissions ?? []).some((permission) => permission.type === type);
  // Editors behind these links need their own permissions; others see plain names.
  const openPlayer = can(PermissionType.MANAGE_USERS)
    ? (id: number) => setPlayerId(id)
    : undefined;
  const canOpenAlliance = can(PermissionType.MANAGE_ALLIANCES);
  const [testMode, setTestMode] = useState(true);
  useEffect(() => {
    fetch('/api/admin/supporters/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((summary) => {
        if (summary) setTestMode(summary.testMode ?? true);
      })
      .catch(() => {});
  }, []);
  const [tab, setTab] = useState<Tab>('overview');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [data, setData] = useState<
    SupporterAdminSummary | { rows: unknown[]; total: number } | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      if (source && tab === 'memberships') params.set('source', source);
      const res = await fetch(
        `/api/admin/supporters/${tab === 'overview' ? 'summary' : tab}?${params}`,
      );
      if (!res.ok) throw new Error(t('loadError'));
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [tab, page, status, source, t]);
  useEffect(() => {
    load();
  }, [load]);
  const changeTab = (value: string | null) => {
    if (value) {
      setTab(value as Tab);
      setPage(1);
      setStatus(null);
      setSource(null);
      setData(null);
    }
  };
  const replay = async (id: number) => {
    if (busyId !== null) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/supporters/events/${id}/replay`, {
        method: 'POST',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || t('actionError'));
      alertService.success(t('replayed'));
      await load();
    } catch (err) {
      alertService.notify(
        'error',
        err instanceof Error ? err.message : t('actionError'),
      );
    } finally {
      setBusyId(null);
    }
  };
  const result = data && 'rows' in data ? data : null;
  const rows = result?.rows ?? [];
  return (
    <AdminLayout
      title={t('title')}
      permissions={[PermissionType.MANAGE_SUPPORTERS]}
    >
      <Tabs value={tab} onChange={changeTab}>
        <Tabs.List>
          {(
            [
              'overview',
              'plans',
              'memberships',
              'payments',
              'events',
              'gifts',
              'alliances',
            ] as Tab[]
          ).map((key) => (
            <Tabs.Tab value={key} key={key}>
              {t(key)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Stack mt="md">
          {(tab === 'memberships' || tab === 'events') && (
            <Group>
              <Select
                label={t('status')}
                clearable
                value={status}
                data={(tab === 'memberships'
                  ? ['ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED']
                  : ['RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED']
                ).map((value) => ({ value, label: t(`labels.${value}`) }))}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
              />
              {tab === 'memberships' && (
                <Select
                  label={t('source')}
                  clearable
                  value={source}
                  data={['SUBSCRIPTION', 'ONE_TIME', 'GIFT', 'COMP'].map(
                    (value) => ({ value, label: t(`labels.${value}`) }),
                  )}
                  onChange={(v) => {
                    setSource(v);
                    setPage(1);
                  }}
                />
              )}
            </Group>
          )}
          {tab === 'payments' && (
            <Button
              component="a"
              href="/api/admin/supporters/payments.csv"
              variant="outline"
            >
              {t('exportCsv')}
            </Button>
          )}
          {loading ? (
            <Loader aria-label={t('loading')} />
          ) : error ? (
            <AdminRequestState message={error} onRetry={load} />
          ) : tab === 'overview' && data && !('rows' in data) ? (
            <SupporterOverview
              summary={data}
              onEvents={() => {
                changeTab('events');
                setStatus('FAILED');
              }}
            />
          ) : result && rows.length === 0 ? (
            <Text>{t('empty')}</Text>
          ) : (
            <>
              {tab === 'plans' && (
                <SupporterPriceTable
                  onPlayer={openPlayer}
                  plans={rows as AdminSupporterPlan[]}
                  onSave={async (plan, priceCents) => {
                    const res = await fetch('/api/admin/supporters/plans', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        planId: plan.id,
                        priceCents,
                        currency: 'usd',
                        expectedCents: plan.priceCents,
                      }),
                    });
                    const payload = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      // Show the price the other admin saved before they retry,
                      // without the loading state that would unmount the editor.
                      if (payload.error === 'price_conflict' && payload.rows)
                        setData(payload);
                      throw new Error(payload.error ?? 'price_save_failed');
                    }
                    setData(payload);
                  }}
                />
              )}
              {tab === 'memberships' && (
                <MembershipTable
                  rows={rows as Rows['memberships']}
                  onPlayer={openPlayer}
                />
              )}
              {tab === 'events' && (
                <EventTable
                  rows={rows as Rows['events']}
                  onPlayer={openPlayer}
                  onReplay={replay}
                  busyId={busyId}
                />
              )}
              {tab === 'payments' && (
                <AdminDataTable ariaLabel={t('payments')}>
                  <Table.Thead>
                    <Table.Tr>
                      {[
                        'player',
                        'date',
                        'description',
                        'amount',
                        'status',
                      ].map((k) => (
                        <Table.Th key={k}>{t(k)}</Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(rows as Rows['payments']).map((r) => (
                      <Table.Tr key={r.id}>
                        <Table.Td>
                          <PlayerButton
                            userId={r.userId}
                            name={r.displayName}
                            onPlayer={openPlayer}
                          />
                        </Table.Td>
                        <Table.Td>{date(r.createdAt)}</Table.Td>
                        <Table.Td>
                          {t(`labels.${r.description}`, {
                            defaultValue: t(`labels.${r.kind}`),
                          })}
                          <StripePaymentLink payment={r} testMode={testMode} />
                        </Table.Td>
                        <Table.Td>{money(r.amountCents, r.currency)}</Table.Td>
                        <Table.Td>
                          <Badge
                            color={
                              r.status === 'SUCCEEDED'
                                ? 'green'
                                : r.status === 'FAILED' ||
                                    r.status === 'DISPUTED'
                                  ? 'red'
                                  : 'gray'
                            }
                          >
                            {t(`labels.${r.status}`)}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </AdminDataTable>
              )}
              {tab === 'gifts' && (
                <AdminDataTable ariaLabel={t('gifts')}>
                  <Table.Thead>
                    <Table.Tr>
                      {[
                        'code',
                        'purchaser',
                        'recipient',
                        'months',
                        'status',
                        'expires',
                      ].map((k) => (
                        <Table.Th key={k}>{t(k)}</Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(rows as Rows['gifts']).map((r) => (
                      <Table.Tr key={r.id}>
                        <Table.Td>{r.codePrefix}</Table.Td>
                        <Table.Td>
                          <PlayerButton
                            userId={r.purchaserUserId}
                            name={r.purchaserName}
                            onPlayer={openPlayer}
                          />
                        </Table.Td>
                        <Table.Td>
                          {(r.redeemedByUserId ?? r.recipientUserId) ? (
                            <PlayerButton
                              userId={
                                r.redeemedByUserId ?? r.recipientUserId ?? 0
                              }
                              name={r.redeemedByName ?? r.recipientName ?? '—'}
                              onPlayer={openPlayer}
                            />
                          ) : (
                            '—'
                          )}
                        </Table.Td>
                        <Table.Td>{r.months}</Table.Td>
                        <Table.Td>{t(`labels.${r.status}`)}</Table.Td>
                        <Table.Td>{date(r.expiresAt)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </AdminDataTable>
              )}
              {tab === 'alliances' && (
                <AdminDataTable ariaLabel={t('alliances')}>
                  <Table.Thead>
                    <Table.Tr>
                      {['alliance', 'amount', 'activeUntil'].map((k) => (
                        <Table.Th key={k}>{t(k)}</Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(rows as Rows['alliances']).map((r) => (
                      <Table.Tr key={r.allianceId}>
                        <Table.Td>
                          {canOpenAlliance ? (
                            <UnstyledButton
                              onClick={() => setAllianceId(r.allianceId)}
                              style={{ textDecoration: 'underline' }}
                            >
                              {r.name}
                            </UnstyledButton>
                          ) : (
                            r.name
                          )}
                        </Table.Td>
                        <Table.Td>{money(r.poolCents)}</Table.Td>
                        <Table.Td>{date(r.activeUntil)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </AdminDataTable>
              )}
              {result &&
                [
                  'memberships',
                  'payments',
                  'events',
                  'gifts',
                  'alliances',
                ].includes(tab) && (
                  <Pagination
                    value={page}
                    onChange={setPage}
                    total={Math.max(1, Math.ceil(result.total / 25))}
                  />
                )}
            </>
          )}
        </Stack>
      </Tabs>
      <AdminPlayerModal
        opened={playerId !== null}
        userId={playerId === null ? null : String(playerId)}
        isAdministrator={isAdministrator}
        onClose={() => setPlayerId(null)}
        onSaved={load}
      />
      <AllianceDetailDrawer
        allianceId={allianceId}
        onClose={() => setAllianceId(null)}
        onChanged={load}
      />
    </AdminLayout>
  );
}
export const getServerSideProps = async (context: { locale?: string }) => ({
  props: {
    ...(await serverSideTranslations(context.locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-content',
      'admin-supporters',
      'admin-users',
      'admin-abuse',
      'admin-forces',
      'admin-upgrades',
      'admin-operations',
      'admin-alliances',
      'supporter',
    ])),
  },
});
