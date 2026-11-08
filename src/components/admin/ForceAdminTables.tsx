import {
  Badge,
  Button,
  Group,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { Fragment, useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import ConfirmationModal from '@/components/ConfirmationModal';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

/** Serialized ForceEvent row (BigInt gold arrives as a string). */
export interface AdminForceEvent {
  id: number;
  action: string;
  quantity: number;
  gold: string;
  createdAt: string;
  actor?: { id: number; display_name: string } | null;
}

/** Serialized ForceContract row from /api/admin/forces/contracts. */
export interface AdminForceContract {
  id: number;
  kind: 'MERCENARY' | 'ALLIANCE';
  status: string;
  userId: number;
  type: string;
  level: number;
  initialQuantity: number;
  survivingQuantity: number;
  woundedQuantity?: number;
  expiresAt: string | null;
  user?: { id: number; display_name: string };
  alliance?: { id: number; name: string } | null;
  events?: AdminForceEvent[];
}

/** Serialized ForceObligation row from /api/admin/forces/obligations. */
export interface AdminForceObligation {
  id: number;
  title: string;
  amountGold: string;
  paidGold: string;
  quantity: number;
  paidQuantity: number;
  type: string | null;
  level: number | null;
  fineGold: string;
  paidFineGold: string;
  dueAt: string;
  cancelledAt: string | null;
  user?: { id: number; display_name: string };
  alliance?: { id: number; name: string };
}

/** Serialized ForceReserve row with its open deployments. */
export interface AdminForceReserve {
  id: number;
  type: string;
  level: number;
  available: number;
  woundedQuantity: number;
  alliance?: { id: number; name: string };
  contracts: AdminForceContract[];
}

/** One wounded group from users.wounded_units. */
export interface AdminWound {
  forceContractId?: number;
  type?: string;
  level?: number;
  quantity?: number;
  isMercenary?: boolean;
}

/** A pending admin action awaiting confirmation. */
export type ForceAction =
  | { kind: 'expire' | 'terminate'; id: number }
  | { kind: 'return'; id: number }
  | { kind: 'waive'; id: number }
  | { kind: 'heal'; id: number };

function requestFor(action: ForceAction, reason?: string) {
  const r = reason?.trim() || undefined;
  switch (action.kind) {
    case 'expire':
    case 'terminate':
      return {
        url: '/api/admin/forces/contracts',
        body: {
          contractId: action.id,
          action: action.kind === 'expire' ? 'EXPIRE' : 'TERMINATE',
          reason: r,
        },
      };
    case 'return':
      return {
        url: '/api/admin/forces/reserves',
        body: { contractId: action.id, reason: r },
      };
    case 'waive':
      return {
        url: '/api/admin/forces/obligations',
        body: { obligationId: action.id, reason: r },
      };
    default:
      return {
        url: '/api/admin/forces/wounded',
        body: { userId: action.id, reason: r },
      };
  }
}

const ACTION_COPY = {
  expire: ['expireTitle', 'expireMessage', 'expire'],
  terminate: ['terminateTitle', 'terminateMessage', 'terminate'],
  return: ['returnTitle', 'returnMessage', 'returnForce'],
  waive: ['waiveTitle', 'waiveMessage', 'waive'],
  heal: ['healTitle', 'healMessage', 'healAll'],
} as const;

/** Confirm modal for every force action; calls `onDone` after success. */
export function ForceActionModal({
  action,
  onClose,
  onDone,
}: {
  action: ForceAction | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation('admin-forces');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const copy = action ? ACTION_COPY[action.kind] : null;

  const close = () => {
    if (busy) return;
    setReason('');
    onClose();
  };

  const confirm = async () => {
    if (!action || busy) return;
    setBusy(true);
    try {
      const { url, body } = requestFor(action, reason);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alertService.notify('error', data?.error ?? t('actionError'), {
          title: t('title'),
        });
        return;
      }
      alertService.notify('success', t('actionDone'), { title: t('title') });
      setReason('');
      onClose();
      onDone();
    } catch (err) {
      logError('Force admin action failed:', err);
      alertService.notify('error', t('actionError'), { title: t('title') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmationModal
      isOpen={action !== null}
      onClose={close}
      onConfirm={confirm}
      title={copy && action ? t(copy[0], { id: action.id }) : ''}
      message={copy ? t(copy[1]) : undefined}
      confirmText={copy ? t(copy[2]) : undefined}
      cancelText={t('cancel')}
      isLoading={busy}
      type={action?.kind === 'heal' ? 'primary' : 'destructive'}
    >
      <Textarea
        label={t('reason')}
        value={reason}
        maxLength={500}
        autosize
        minRows={2}
        onChange={(e) => setReason(e.currentTarget.value)}
      />
    </ConfirmationModal>
  );
}

const fmtDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : '—';

const OPEN_STATUSES = new Set(['ACTIVE', 'REQUESTED']);

/** Contracts with expandable ForceEvent history and expire/terminate actions. */
export function ForceContractsTable({
  contracts,
  onAction,
  showPlayer = true,
}: {
  contracts: AdminForceContract[];
  onAction: (action: ForceAction) => void;
  showPlayer?: boolean;
}) {
  const { t } = useTranslation('admin-forces');
  const [openId, setOpenId] = useState<number | null>(null);
  if (!contracts.length) return <Text c="dimmed">{t('none')}</Text>;
  const columns = showPlayer ? 9 : 8;
  return (
    <AdminDataTable ariaLabel={t('contracts')} size="wide">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t('id')}</Table.Th>
          <Table.Th>{t('kind')}</Table.Th>
          <Table.Th>{t('status')}</Table.Th>
          {showPlayer && <Table.Th>{t('player')}</Table.Th>}
          <Table.Th>{t('unit')}</Table.Th>
          <Table.Th>{t('quantity')}</Table.Th>
          <Table.Th>{t('wounded')}</Table.Th>
          <Table.Th>{t('expires')}</Table.Th>
          <Table.Th>{t('actions')}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {contracts.map((c) => (
          <Fragment key={c.id}>
            <Table.Tr>
              <Table.Td>{c.id}</Table.Td>
              <Table.Td>
                {c.kind}
                {c.alliance ? ` · ${c.alliance.name}` : ''}
              </Table.Td>
              <Table.Td>
                <Badge
                  variant="light"
                  color={OPEN_STATUSES.has(c.status) ? 'green' : 'gray'}
                >
                  {c.status}
                </Badge>
              </Table.Td>
              {showPlayer && (
                <Table.Td>
                  {c.user?.display_name ?? '—'} (ID: {c.userId})
                </Table.Td>
              )}
              <Table.Td>
                {c.type} L{c.level}
              </Table.Td>
              <Table.Td>
                {c.survivingQuantity} / {c.initialQuantity}
              </Table.Td>
              <Table.Td>{c.woundedQuantity ?? 0}</Table.Td>
              <Table.Td>{fmtDate(c.expiresAt)}</Table.Td>
              <Table.Td>
                <Group gap="xs" wrap="nowrap">
                  <Button
                    size="xs"
                    variant="default"
                    aria-expanded={openId === c.id}
                    onClick={() => setOpenId(openId === c.id ? null : c.id)}
                  >
                    {t('history')}
                  </Button>
                  {OPEN_STATUSES.has(c.status) && (
                    <>
                      <Button
                        size="xs"
                        color="orange"
                        onClick={() => onAction({ kind: 'expire', id: c.id })}
                      >
                        {t('expire')}
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        onClick={() =>
                          onAction({ kind: 'terminate', id: c.id })
                        }
                      >
                        {t('terminate')}
                      </Button>
                    </>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
            {openId === c.id && (
              <Table.Tr>
                <Table.Td colSpan={columns}>
                  {c.events?.length ? (
                    <Stack gap={2}>
                      {c.events.map((e) => (
                        <Text key={e.id} size="xs">
                          {fmtDate(e.createdAt)} · {e.action} · qty {e.quantity}{' '}
                          · gold {e.gold}
                          {e.actor ? ` · ${e.actor.display_name}` : ''}
                        </Text>
                      ))}
                    </Stack>
                  ) : (
                    <Text size="xs" c="dimmed">
                      {t('noHistory')}
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            )}
          </Fragment>
        ))}
      </Table.Tbody>
    </AdminDataTable>
  );
}

/** Obligations with a waive action on open rows. */
export function ForceObligationsTable({
  obligations,
  onAction,
  showPlayer = true,
}: {
  obligations: AdminForceObligation[];
  onAction: (action: ForceAction) => void;
  showPlayer?: boolean;
}) {
  const { t } = useTranslation('admin-forces');
  if (!obligations.length) return <Text c="dimmed">{t('none')}</Text>;
  return (
    <AdminDataTable ariaLabel={t('obligations')}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t('id')}</Table.Th>
          <Table.Th>{t('obligation')}</Table.Th>
          {showPlayer && <Table.Th>{t('player')}</Table.Th>}
          <Table.Th>{t('alliance')}</Table.Th>
          <Table.Th>{t('owed')}</Table.Th>
          <Table.Th>{t('fine')}</Table.Th>
          <Table.Th>{t('due')}</Table.Th>
          <Table.Th>{t('cancelledAt')}</Table.Th>
          <Table.Th>{t('actions')}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {obligations.map((o) => (
          <Table.Tr key={o.id}>
            <Table.Td>{o.id}</Table.Td>
            <Table.Td>{o.title}</Table.Td>
            {showPlayer && <Table.Td>{o.user?.display_name ?? '—'}</Table.Td>}
            <Table.Td>{o.alliance?.name ?? '—'}</Table.Td>
            <Table.Td>
              {o.amountGold} ({o.paidGold})
              {o.quantity > 0 &&
                ` · ${o.quantity} ${o.type ?? ''} L${o.level ?? '?'} (${o.paidQuantity})`}
            </Table.Td>
            <Table.Td>
              {o.fineGold} ({o.paidFineGold})
            </Table.Td>
            <Table.Td>{fmtDate(o.dueAt)}</Table.Td>
            <Table.Td>{fmtDate(o.cancelledAt)}</Table.Td>
            <Table.Td>
              {!o.cancelledAt && (
                <Button
                  size="xs"
                  color="red"
                  onClick={() => onAction({ kind: 'waive', id: o.id })}
                >
                  {t('waive')}
                </Button>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </AdminDataTable>
  );
}

/** Alliance reserves with each open deployment and its return action. */
export function ForceReservesTable({
  reserves,
  onAction,
}: {
  reserves: AdminForceReserve[];
  onAction: (action: ForceAction) => void;
}) {
  const { t } = useTranslation('admin-forces');
  if (!reserves.length) return <Text c="dimmed">{t('none')}</Text>;
  return (
    <AdminDataTable ariaLabel={t('tabReserves')}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t('id')}</Table.Th>
          <Table.Th>{t('alliance')}</Table.Th>
          <Table.Th>{t('unit')}</Table.Th>
          <Table.Th>{t('available')}</Table.Th>
          <Table.Th>{t('wounded')}</Table.Th>
          <Table.Th>{t('deployments')}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {reserves.map((r) => (
          <Table.Tr key={r.id}>
            <Table.Td>{r.id}</Table.Td>
            <Table.Td>{r.alliance?.name ?? '—'}</Table.Td>
            <Table.Td>
              {r.type} L{r.level}
            </Table.Td>
            <Table.Td>{r.available}</Table.Td>
            <Table.Td>{r.woundedQuantity}</Table.Td>
            <Table.Td>
              {r.contracts.length ? (
                <Stack gap={4}>
                  {r.contracts.map((c) => (
                    <Group key={c.id} gap="xs" wrap="nowrap">
                      <Text size="sm">
                        #{c.id} {c.user?.display_name ?? c.userId} ·{' '}
                        {c.survivingQuantity} · {c.status}
                      </Text>
                      {c.status === 'ACTIVE' && (
                        <Button
                          size="xs"
                          color="orange"
                          onClick={() => onAction({ kind: 'return', id: c.id })}
                        >
                          {t('returnForce')}
                        </Button>
                      )}
                    </Group>
                  ))}
                </Stack>
              ) : (
                '—'
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </AdminDataTable>
  );
}

/** Wounded groups for one player. */
export function ForceWoundedTable({ wounded }: { wounded: AdminWound[] }) {
  const { t } = useTranslation('admin-forces');
  if (!wounded.length) return <Text c="dimmed">{t('noWounded')}</Text>;
  return (
    <AdminDataTable ariaLabel={t('woundedUnits')}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t('unit')}</Table.Th>
          <Table.Th>{t('wounded')}</Table.Th>
          <Table.Th>{t('contract')}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {wounded.map((w, i) => (
          <Table.Tr
            key={`${w.forceContractId ?? 'p'}-${w.type}-${w.level}-${i}`}
          >
            <Table.Td>
              {w.type ?? '—'} L{w.level ?? 1}
              {w.isMercenary ? ' (merc)' : ''}
            </Table.Td>
            <Table.Td>{w.quantity ?? 0}</Table.Td>
            <Table.Td>
              {w.forceContractId ? `#${w.forceContractId}` : t('permanent')}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </AdminDataTable>
  );
}
