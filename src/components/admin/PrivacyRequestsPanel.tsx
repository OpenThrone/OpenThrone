import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Pagination,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import { erasureRowDetail } from '@/utils/erasureRowDetail';

export interface ErasureRow {
  id: number;
  userId: number;
  displayName: string;
  status:
    | 'AWAITING_CONFIRMATION'
    | 'PENDING'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'EXPIRED';
  requestedAt: string;
  confirmedAt: string | null;
  scheduledFor: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  expeditedByUserId: number | null;
  attempts: number;
  lastError: string | null;
}

export interface ExportRow {
  id: number;
  userId: number;
  displayName: string;
  requestedAt: string;
  completedAt: string | null;
  byteSize: number | null;
}

export type PrivacyView = 'erasure' | 'exports';
export type PrivacyAction = 'cancel' | 'expedite';

export const MIN_REASON_LENGTH = 10;

const STATUS_COLOR: Record<ErasureRow['status'], string> = {
  AWAITING_CONFIRMATION: 'yellow',
  PENDING: 'orange',
  COMPLETED: 'gray',
  CANCELLED: 'gray',
  EXPIRED: 'gray',
};

/** Staff view of erasure and export requests with reasoned cancel / erase-now actions. */
export function PrivacyRequestsView({
  view,
  onViewChange,
  erasures,
  exports: exportRows,
  page,
  totalPages,
  onPageChange,
  loading,
  busy,
  error,
  notice,
  onAction,
  onOpen,
  fixedUserId,
}: {
  view: PrivacyView;
  onViewChange: (view: PrivacyView) => void;
  erasures: ErasureRow[];
  exports: ExportRow[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  loading: boolean;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onAction: (
    action: PrivacyAction,
    requestId: number,
    reason: string,
  ) => Promise<boolean>;
  onOpen: (userId: number, reason: string) => Promise<boolean>;
  /** Set on a single player's page: the open dialog needs no player ID. */
  fixedUserId?: number;
}) {
  const { t, i18n } = useTranslation('admin-users');
  const [pending, setPending] = useState<{
    action: PrivacyAction;
    row: ErasureRow;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [opening, setOpening] = useState(false);
  const [openUserId, setOpenUserId] = useState<number | string>('');
  const [openReason, setOpenReason] = useState('');
  const when = (value: string | null) =>
    value ? new Date(value).toLocaleString(i18n.language) : '—';
  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH;
  const openReasonOk = openReason.trim().length >= MIN_REASON_LENGTH;

  return (
    <Stack>
      <Text>{t('privacy.intro')}</Text>
      {error && (
        <Alert role="alert" color="red">
          {error}
        </Alert>
      )}
      {notice && <Alert role="status">{notice}</Alert>}
      <Group justify="space-between">
        <SegmentedControl
          value={view}
          onChange={(value) => onViewChange(value as PrivacyView)}
          data={[
            { value: 'erasure', label: t('privacy.tabs.erasure') },
            { value: 'exports', label: t('privacy.tabs.exports') },
          ]}
          aria-label={t('privacy.tabs.label')}
        />
        {view === 'erasure' && (
          <Button variant="default" onClick={() => setOpening(true)}>
            {t('privacy.open.button')}
          </Button>
        )}
      </Group>

      {view === 'erasure' ? (
        <AdminDataTable
          ariaLabel={t('privacy.tabs.erasure')}
          aria-busy={loading}
          size={fixedUserId === undefined ? 'wide' : 'default'}
        >
          <Table.Thead>
            <Table.Tr>
              {[
                'player',
                'status',
                'requested',
                'scheduled',
                'detail',
                'actions',
              ].map((key) => (
                <Table.Th key={key}>{t(`privacy.columns.${key}`)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {erasures.map((row) => {
              const live =
                row.status === 'PENDING' ||
                row.status === 'AWAITING_CONFIRMATION';
              return (
                <Table.Tr key={row.id}>
                  <Table.Td>
                    {row.displayName}{' '}
                    <Text span c="dimmed">
                      #{row.userId}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={STATUS_COLOR[row.status]} variant="light">
                      {t(`privacy.status.${row.status}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{when(row.requestedAt)}</Table.Td>
                  <Table.Td>
                    {when(row.completedAt ?? row.scheduledFor)}
                  </Table.Td>
                  <Table.Td>
                    {(() => {
                      const detail = erasureRowDetail(row);
                      if (detail.key === 'failed')
                        return t('privacy.failed', {
                          attempts: detail.attempts,
                          error: detail.error,
                        });
                      if (detail.key === 'expedited')
                        return t('privacy.expedited');
                      if (detail.key === 'cancelledBy')
                        return t('privacy.cancelledByNoReason', {
                          by: t(`privacy.by.${detail.by}`),
                        });
                      return '—';
                    })()}
                  </Table.Td>
                  <Table.Td>
                    {live && (
                      <Group gap="xs" wrap="nowrap">
                        <Button
                          size="xs"
                          variant="default"
                          disabled={busy}
                          onClick={() => {
                            setReason('');
                            setPending({ action: 'cancel', row });
                          }}
                        >
                          {t('privacy.actions.cancel')}
                        </Button>
                        {row.status === 'PENDING' && (
                          <Button
                            size="xs"
                            color="red"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setReason('');
                              setPending({ action: 'expedite', row });
                            }}
                          >
                            {t('privacy.actions.expedite')}
                          </Button>
                        )}
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {!erasures.length && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  {t(loading ? 'privacy.loading' : 'privacy.emptyErasure')}
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </AdminDataTable>
      ) : (
        <AdminDataTable
          ariaLabel={t('privacy.tabs.exports')}
          aria-busy={loading}
          size="compact"
        >
          <Table.Thead>
            <Table.Tr>
              {['player', 'requested', 'completed', 'size'].map((key) => (
                <Table.Th key={key}>{t(`privacy.columns.${key}`)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {exportRows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>
                  {row.displayName}{' '}
                  <Text span c="dimmed">
                    #{row.userId}
                  </Text>
                </Table.Td>
                <Table.Td>{when(row.requestedAt)}</Table.Td>
                <Table.Td>{when(row.completedAt)}</Table.Td>
                <Table.Td>
                  {row.byteSize === null
                    ? '—'
                    : `${Math.max(1, Math.round(row.byteSize / 1024))} KB`}
                </Table.Td>
              </Table.Tr>
            ))}
            {!exportRows.length && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  {t(loading ? 'privacy.loading' : 'privacy.emptyExports')}
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </AdminDataTable>
      )}
      <Pagination
        value={page}
        onChange={onPageChange}
        total={Math.max(1, totalPages)}
        disabled={loading || busy}
      />

      <Modal
        opened={pending !== null}
        onClose={() => !busy && setPending(null)}
        title={
          pending
            ? t(`privacy.actions.${pending.action}Title`, {
                name: pending.row.displayName,
              })
            : ''
        }
      >
        <Text size="sm" mb="sm">
          {pending ? t(`privacy.actions.${pending.action}Body`) : ''}
        </Text>
        <Textarea
          label={t('privacy.reason')}
          description={t('privacy.reasonHint', { min: MIN_REASON_LENGTH })}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          minRows={3}
          maxLength={500}
          autosize
          data-autofocus
        />
        <Group justify="flex-end" mt="md">
          <Button
            variant="default"
            disabled={busy}
            onClick={() => setPending(null)}
          >
            {t('privacy.dismiss')}
          </Button>
          <Button
            color={pending?.action === 'expedite' ? 'red' : undefined}
            loading={busy}
            disabled={!reasonOk}
            onClick={async () => {
              if (!pending) return;
              if (
                await onAction(pending.action, pending.row.id, reason.trim())
              ) {
                setPending(null);
              }
            }}
          >
            {pending ? t(`privacy.actions.${pending.action}Confirm`) : ''}
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={opening}
        onClose={() => !busy && setOpening(false)}
        title={t('privacy.open.title')}
      >
        <Text size="sm" mb="sm">
          {t('privacy.open.body')}
        </Text>
        {fixedUserId === undefined && (
          <NumberInput
            label={t('privacy.open.userId')}
            value={openUserId}
            onChange={setOpenUserId}
            min={1}
            allowDecimal={false}
            hideControls
          />
        )}
        <Textarea
          mt="sm"
          label={t('privacy.reason')}
          description={t('privacy.reasonHint', { min: MIN_REASON_LENGTH })}
          value={openReason}
          onChange={(event) => setOpenReason(event.currentTarget.value)}
          minRows={3}
          maxLength={500}
          autosize
        />
        <Group justify="flex-end" mt="md">
          <Button
            variant="default"
            disabled={busy}
            onClick={() => setOpening(false)}
          >
            {t('privacy.dismiss')}
          </Button>
          <Button
            loading={busy}
            disabled={!openReasonOk || !(fixedUserId ?? Number(openUserId))}
            onClick={async () => {
              if (
                await onOpen(
                  fixedUserId ?? Number(openUserId),
                  openReason.trim(),
                )
              ) {
                setOpening(false);
                setOpenUserId('');
                setOpenReason('');
              }
            }}
          >
            {t('privacy.open.confirm')}
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
