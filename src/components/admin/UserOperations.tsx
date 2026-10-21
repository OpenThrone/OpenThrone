import {
  Alert,
  Button,
  Group,
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
}

type Operation = 'password' | 'reset' | 'vacation-start' | 'vacation-end';

const UserOperations = ({
  userId,
  onSaved,
  isAdministrator,
}: UserOperationsProps) => {
  const { t } = useTranslation('admin-operations');
  const [operation, setOperation] = useState<Operation | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const close = () => {
    if (pending) return;
    setOperation(null);
    setReason('');
    setError(null);
  };

  const confirm = async () => {
    const numericId = Number(userId);
    if (!Number.isSafeInteger(numericId) || numericId <= 0 || !operation) {
      setError(t('user.invalidTarget'));
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    try {
      let endpoint = '/api/admin/users/reset-password';
      let payload: Record<string, unknown> = { userId: numericId };
      if (operation === 'reset') {
        endpoint = '/api/admin/account-reset';
        payload = { ...payload, reason: reason.trim() || undefined };
      } else if (operation.startsWith('vacation-')) {
        endpoint = '/api/admin/vacation';
        payload = {
          ...payload,
          action: operation === 'vacation-start' ? 'start' : 'end',
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : t('user.requestFailed'),
        );
      }

      const successMessage =
        operation === 'password'
          ? t('user.passwordResult')
          : operation === 'reset'
            ? t('user.accountResetResult', {
                newUserId: data.newUserId ?? t('user.unknown'),
              })
            : operation === 'vacation-start'
              ? t('user.vacationStarted')
              : t('user.vacationEnded');
      setResult(successMessage);
      setOperation(null);
      setReason('');
      onSaved();
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
              onClick={() => setOperation('password')}
              disabled={pending}
            >
              {t('user.passwordAction')}
            </Button>
            {isAdministrator && (
              <>
                <Button
                  color="red"
                  onClick={() => setOperation('reset')}
                  disabled={pending}
                >
                  {t('user.accountResetAction')}
                </Button>
                <Button
                  variant="default"
                  onClick={() => setOperation('vacation-start')}
                  disabled={pending}
                >
                  {t('user.vacationStartAction')}
                </Button>
                <Button
                  variant="default"
                  onClick={() => setOperation('vacation-end')}
                  disabled={pending}
                >
                  {t('user.vacationEndAction')}
                </Button>
              </>
            )}
          </Group>
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
        type={
          operation === 'password' || operation === 'vacation-end'
            ? 'primary'
            : 'destructive'
        }
        confirmText={t('user.confirmAction')}
        cancelText={t('user.cancel')}
        isLoading={pending}
        confirmDisabled={!operation}
      >
        {operation === 'reset' && (
          <Textarea
            label={t('user.reasonLabel')}
            description={t('user.reasonOptional')}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            maxLength={500}
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
