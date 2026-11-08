import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import { alertService } from '@/services/Alert.service';

interface UserOperationsProps {
  userId: string;
  onSaved: () => void;
  isAdministrator: boolean;
  /** Viewer holds MANAGE_ACCOUNT_STATUS (suspend, ban, reactivate). */
  canManageStatus?: boolean;
  /** Target's current account status, as shown on the profile tab. */
  currentStatus?: string;
  /** Called after a status change or erasure so the editor can refresh it. */
  onStatusChanged?: () => void;
}

type StatusOperation = 'suspend' | 'ban' | 'reactivate' | 'close' | 'erase';
type Operation =
  | 'password'
  | 'reset'
  | 'vacation-start'
  | 'vacation-end'
  | StatusOperation;

const STATUS_OPERATIONS: readonly Operation[] = [
  'suspend',
  'ban',
  'reactivate',
  'close',
  'erase',
];
const RESTRICTED_STATUSES = ['BANNED', 'SUSPENDED', 'CLOSED'];
/** The erasure service rejects shorter reasons. */
const ERASE_REASON_MIN = 10;
const ERASURE_ERROR_KEYS: Record<string, string> = {
  reason_required: 'user.erasureErrors.reason_required',
  staff_account: 'user.erasureErrors.staff_account',
  already_scheduled: 'user.erasureErrors.already_scheduled',
  not_found: 'user.erasureErrors.not_found',
};

const UserOperations = ({
  userId,
  onSaved,
  isAdministrator,
  canManageStatus = false,
  currentStatus,
  onStatusChanged,
}: UserOperationsProps) => {
  const { t } = useTranslation('admin-operations');
  const [operation, setOperation] = useState<Operation | null>(null);
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState<number | string>(7);
  const [permanent, setPermanent] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const open = (next: Operation) => {
    setOperation(next);
    setReason('');
    setDuration(7);
    setPermanent(true);
    setError(null);
  };

  const close = () => {
    if (pending) return;
    setOperation(null);
    setReason('');
    setError(null);
  };

  const trimmedReason = reason.trim();
  const durationDays =
    typeof duration === 'number' && Number.isInteger(duration)
      ? duration
      : null;
  const durationValid =
    durationDays !== null && durationDays >= 1 && durationDays <= 3650;
  const needsDuration =
    operation === 'suspend' || (operation === 'ban' && !permanent);
  const reasonRequired =
    operation === 'suspend' ||
    operation === 'ban' ||
    operation === 'close' ||
    operation === 'erase';
  const reasonMin = operation === 'erase' ? ERASE_REASON_MIN : 1;
  const confirmBlocked =
    !operation ||
    (reasonRequired && trimmedReason.length < reasonMin) ||
    (needsDuration && !durationValid);

  const statusPayload = (numericId: number) => {
    const reasonValue = trimmedReason || undefined;
    switch (operation) {
      case 'suspend':
        return {
          userId: numericId,
          action: 'SUSPENDED',
          duration: durationDays ?? undefined,
          reason: reasonValue,
        };
      case 'ban':
        return {
          userId: numericId,
          action: 'BANNED',
          duration: permanent ? undefined : (durationDays ?? undefined),
          reason: reasonValue,
        };
      case 'close':
        return { userId: numericId, action: 'CLOSED', reason: reasonValue };
      default:
        return { userId: numericId, action: 'ACTIVE', reason: reasonValue };
    }
  };

  const successFor = (op: Operation, data: Record<string, unknown>) => {
    switch (op) {
      case 'password':
        return t('user.passwordResult');
      case 'reset':
        return t('user.accountResetResult', {
          newUserId: data.newUserId ?? t('user.unknown'),
        });
      case 'vacation-start':
        return t('user.vacationStarted');
      case 'vacation-end':
        return t('user.vacationEnded');
      case 'suspend':
        return t('user.suspendResult', { count: durationDays ?? 0 });
      case 'ban':
        return permanent
          ? t('user.banPermanentResult')
          : t('user.banResult', { count: durationDays ?? 0 });
      case 'close':
        return t('user.closeResult');
      case 'erase':
        return t('user.eraseResult');
      default:
        return t('user.reactivateResult');
    }
  };

  const confirm = async () => {
    const numericId = Number(userId);
    if (!Number.isSafeInteger(numericId) || numericId <= 0 || !operation) {
      setError(t('user.invalidTarget'));
      return;
    }
    if (confirmBlocked) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      let endpoint = '/api/admin/users/reset-password';
      let payload: Record<string, unknown> = { userId: numericId };
      if (operation === 'reset') {
        endpoint = '/api/admin/account-reset';
        payload = { ...payload, reason: trimmedReason || undefined };
      } else if (operation.startsWith('vacation-')) {
        endpoint = '/api/admin/vacation';
        payload = {
          ...payload,
          action: operation === 'vacation-start' ? 'start' : 'end',
        };
      } else if (operation === 'erase') {
        endpoint = '/api/admin/privacy/erasure';
        payload = { action: 'open', userId: numericId, reason: trimmedReason };
      } else if (STATUS_OPERATIONS.includes(operation)) {
        endpoint = '/api/admin/account-action';
        payload = statusPayload(numericId);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const erasureKey =
          operation === 'erase' && typeof data.error === 'string'
            ? ERASURE_ERROR_KEYS[data.error]
            : undefined;
        throw new Error(
          erasureKey
            ? t(erasureKey)
            : typeof data.error === 'string'
              ? data.error
              : t('user.requestFailed'),
        );
      }

      const successMessage = successFor(operation, data);
      const changedStatus = STATUS_OPERATIONS.includes(operation);
      setResult(successMessage);
      setOperation(null);
      setReason('');
      onSaved();
      if (changedStatus) onStatusChanged?.();
      alertService.notify('success', successMessage, {
        title: t('user.actionComplete'),
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('user.requestFailed'),
      );
    } finally {
      setPending(false);
    }
  };

  const actionTitle = operation ? t(`user.confirm.${operation}.title`) : '';
  const actionMessage = operation ? t(`user.confirm.${operation}.message`) : '';
  const isRestricted =
    currentStatus !== undefined && RESTRICTED_STATUSES.includes(currentStatus);
  const showStatusControls = canManageStatus || isAdministrator;
  const confirmTone =
    operation === 'password' ||
    operation === 'vacation-end' ||
    operation === 'reactivate'
      ? 'primary'
      : 'destructive';

  return (
    <>
      <GameCard title={t('user.title')}>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t('user.description')}
          </Text>
          <Group align="stretch" wrap="wrap">
            <Button
              variant="default"
              onClick={() => open('password')}
              disabled={pending}
            >
              {t('user.passwordAction')}
            </Button>
            {isAdministrator && (
              <>
                <Button
                  color="red"
                  onClick={() => open('reset')}
                  disabled={pending}
                >
                  {t('user.accountResetAction')}
                </Button>
                <Button
                  variant="default"
                  onClick={() => open('vacation-start')}
                  disabled={pending}
                >
                  {t('user.vacationStartAction')}
                </Button>
                <Button
                  variant="default"
                  onClick={() => open('vacation-end')}
                  disabled={pending}
                >
                  {t('user.vacationEndAction')}
                </Button>
              </>
            )}
          </Group>
          {showStatusControls && (
            <>
              <Divider
                label={t('user.statusHeading')}
                labelPosition="left"
                mt="xs"
              />
              <Text size="sm" c="dimmed">
                {t('user.statusDescription', {
                  status: currentStatus ?? t('user.unknown'),
                })}
              </Text>
              <Group align="stretch" wrap="wrap">
                {canManageStatus && (
                  <>
                    <Button
                      variant="default"
                      onClick={() => open('suspend')}
                      disabled={pending}
                    >
                      {t('user.suspendAction')}
                    </Button>
                    <Button
                      color="red"
                      onClick={() => open('ban')}
                      disabled={pending}
                    >
                      {t('user.banAction')}
                    </Button>
                    {isRestricted && (
                      <Button
                        variant="default"
                        onClick={() => open('reactivate')}
                        disabled={pending}
                      >
                        {t('user.reactivateAction')}
                      </Button>
                    )}
                  </>
                )}
                {isAdministrator && (
                  <>
                    {currentStatus !== 'CLOSED' && (
                      <Button
                        variant="default"
                        onClick={() => open('close')}
                        disabled={pending}
                      >
                        {t('user.closeAction')}
                      </Button>
                    )}
                    <Button
                      color="red"
                      variant="outline"
                      onClick={() => open('erase')}
                      disabled={pending}
                    >
                      {t('user.eraseAction')}
                    </Button>
                  </>
                )}
              </Group>
            </>
          )}
          {result && <Alert color="green">{result}</Alert>}
          {error && (
            <Alert color="red" role="alert" title={t('user.errorTitle')}>
              {error}
            </Alert>
          )}
        </Stack>
      </GameCard>

      <ConfirmationModal
        isOpen={operation !== null}
        onClose={close}
        onConfirm={confirm}
        title={actionTitle}
        message={actionMessage}
        type={confirmTone}
        confirmText={t('user.confirmAction')}
        cancelText={t('user.cancel')}
        isLoading={pending}
        confirmDisabled={confirmBlocked}
      >
        {operation === 'ban' && (
          <Checkbox
            label={t('user.permanentLabel')}
            checked={permanent}
            onChange={(event) => setPermanent(event.currentTarget.checked)}
          />
        )}
        {needsDuration && (
          <NumberInput
            label={t('user.durationLabel')}
            description={t('user.durationHelp')}
            min={1}
            max={3650}
            allowDecimal={false}
            value={duration}
            onChange={setDuration}
            error={durationValid ? undefined : t('user.durationInvalid')}
            required
          />
        )}
        {(operation === 'reset' ||
          (operation && STATUS_OPERATIONS.includes(operation))) && (
          <Textarea
            label={t('user.reasonLabel')}
            description={
              operation === 'erase'
                ? t('user.reasonMin', { count: ERASE_REASON_MIN })
                : reasonRequired
                  ? t('user.reasonRequired')
                  : t('user.reasonOptional')
            }
            required={reasonRequired}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            maxLength={operation === 'erase' ? 500 : 1000}
            autosize
            minRows={2}
            maxRows={5}
          />
        )}
        {operation === 'vacation-start' && (
          <Paper p="sm" withBorder>
            <Text size="sm">{t('user.vacationDuration')}</Text>
          </Paper>
        )}
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
      </ConfirmationModal>
    </>
  );
};

export default UserOperations;

interface AdminUserExportProps {
  userId: string;
}

export const AdminUserExport = ({ userId }: AdminUserExportProps) => {
  const { t } = useTranslation('admin-operations');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (!/^\d+$/.test(userId) || Number(userId) <= 0) {
      setError(t('export.invalidTarget'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/users/export?userId=${encodeURIComponent(userId)}`,
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : t('export.failed'),
        );
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(t('export.invalidResponse'));
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error(t('export.invalidResponse'));

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `user-${userId}-export.json`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : t('export.failed'),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack gap="xs">
      <Button variant="default" onClick={download} loading={pending}>
        {t('export.action')}
      </Button>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
    </Stack>
  );
};
