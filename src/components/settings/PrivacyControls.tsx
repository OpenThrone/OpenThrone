import {
  faDownload,
  faHourglassHalf,
  faUserSlash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Alert,
  Button,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';

/** Mirrors `ErasureState` from the erasure service (kept client-safe). */
export interface ErasureStateView {
  status: 'NONE' | 'AWAITING_CONFIRMATION' | 'PENDING';
  requestedAt: string | null;
  confirmationExpiresAt: string | null;
  scheduledFor: string | null;
}

export interface PrivacyCredentials {
  password: string;
  totpToken?: string;
  reason?: string;
}

/** Refusal codes the privacy routes return, mapped to translation keys. */
const ERROR_KEYS: Record<string, string> = {
  invalid_password: 'settings.privacy.errors.invalid_password',
  invalid_totp: 'settings.privacy.errors.invalid_totp',
  totp_required: 'settings.privacy.errors.totp_required',
  rate_limited: 'settings.privacy.errors.rate_limited',
  staff_account: 'settings.privacy.errors.staff_account',
  already_scheduled: 'settings.privacy.errors.already_scheduled',
  email_failed: 'settings.privacy.errors.email_failed',
  impersonated: 'settings.privacy.errors.impersonated',
};

/** Password, optional authenticator code and (for erasure) an optional reason. */
export function PrivacyCredentialsForm({
  requiresTotp,
  withReason,
  busy,
  error,
  submitLabel,
  destructive,
  onSubmit,
  onCancel,
}: {
  requiresTotp: boolean;
  withReason?: boolean;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  destructive?: boolean;
  onSubmit: (credentials: PrivacyCredentials) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation('home');
  const [password, setPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [reason, setReason] = useState('');
  const totpInvalid = requiresTotp && !/^\d{6}$/.test(totpToken);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || !password || totpInvalid) return;
        onSubmit({
          password,
          ...(requiresTotp ? { totpToken } : {}),
          ...(withReason && reason.trim() ? { reason: reason.trim() } : {}),
        });
      }}
    >
      <Stack gap="sm">
        <PasswordInput
          label={t('settings.privacy.password')}
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          autoComplete="current-password"
          disabled={busy}
          data-autofocus
        />
        {requiresTotp && (
          <TextInput
            label={t('settings.privacy.totp')}
            value={totpToken}
            onChange={(event) =>
              setTotpToken(event.currentTarget.value.replace(/\D/g, ''))
            }
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            disabled={busy}
          />
        )}
        {withReason && (
          <Textarea
            label={t('settings.privacy.reason')}
            description={t('settings.privacy.reasonHint')}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            maxLength={500}
            minRows={2}
            autosize
            disabled={busy}
          />
        )}
        {error && (
          <Text role="alert" size="sm" c="red">
            {error}
          </Text>
        )}
        <Group justify="flex-end">
          {onCancel && (
            <Button variant="default" onClick={onCancel} disabled={busy}>
              {t('settings.cancel')}
            </Button>
          )}
          <Button
            type="submit"
            color={destructive ? 'red' : undefined}
            loading={busy}
            disabled={!password || totpInvalid}
          >
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

type Dialog = 'export' | 'erasure' | null;

/**
 * "Your data" card: download a copy of the account's data, or ask for it to be
 * erased. Pure view; the live card below owns the requests.
 */
export function PrivacyControlsView({
  erasure,
  requiresTotp,
  busy,
  dialog,
  dialogError,
  exportNotice,
  onOpen,
  onClose,
  onExport,
  onRequestErasure,
  onWithdraw,
}: {
  erasure: ErasureStateView | null;
  requiresTotp: boolean;
  busy: boolean;
  dialog: Dialog;
  dialogError: string | null;
  exportNotice: string | null;
  onOpen: (dialog: Exclude<Dialog, null>) => void;
  onClose: () => void;
  onExport: (credentials: PrivacyCredentials) => void;
  onRequestErasure: (credentials: PrivacyCredentials) => void;
  onWithdraw: () => void;
}) {
  const { t, i18n } = useTranslation('home');
  const awaiting = erasure?.status === 'AWAITING_CONFIRMATION';
  const expires =
    awaiting && erasure?.confirmationExpiresAt
      ? new Date(erasure.confirmationExpiresAt).toLocaleString(i18n.language)
      : '';
  return (
    <GameCard title={t('settings.privacy.title')} icon={faDownload}>
      <Stack gap="lg">
        <Text size="sm">{t('settings.privacy.intro')}</Text>

        <Stack gap="xs" component="section" aria-labelledby="privacy-export">
          <Text fw={600} id="privacy-export">
            {t('settings.privacy.download.title')}
          </Text>
          <Text size="sm">{t('settings.privacy.download.description')}</Text>
          {exportNotice && (
            <Text role="status" size="sm">
              {exportNotice}
            </Text>
          )}
          <Group>
            <Button
              variant="outline"
              leftSection={<FontAwesomeIcon icon={faDownload} />}
              onClick={() => onOpen('export')}
            >
              {t('settings.privacy.download.button')}
            </Button>
          </Group>
        </Stack>

        <Stack gap="xs" component="section" aria-labelledby="privacy-erase">
          <Text fw={600} id="privacy-erase">
            {t('settings.privacy.erase.title')}
          </Text>
          <Text size="sm">{t('settings.privacy.erase.description')}</Text>
          {awaiting ? (
            <Alert
              color="yellow"
              icon={<FontAwesomeIcon icon={faHourglassHalf} />}
              title={t('settings.privacy.erase.awaitingTitle')}
            >
              <Text size="sm">
                {t('settings.privacy.erase.awaiting', { time: expires })}
              </Text>
              <Group mt="sm">
                <Button
                  variant="default"
                  size="xs"
                  loading={busy}
                  onClick={onWithdraw}
                >
                  {t('settings.privacy.erase.withdraw')}
                </Button>
              </Group>
            </Alert>
          ) : (
            <Group>
              <Button
                color="red"
                variant="outline"
                leftSection={<FontAwesomeIcon icon={faUserSlash} />}
                onClick={() => onOpen('erasure')}
              >
                {t('settings.privacy.erase.button')}
              </Button>
            </Group>
          )}
        </Stack>
      </Stack>

      <Modal
        opened={dialog === 'export'}
        onClose={() => !busy && onClose()}
        title={t('settings.privacy.download.modalTitle')}
      >
        <Text size="sm" mb="md">
          {t('settings.privacy.download.modalBody')}
        </Text>
        <PrivacyCredentialsForm
          requiresTotp={requiresTotp}
          busy={busy}
          error={dialogError}
          submitLabel={t('settings.privacy.download.submit')}
          onSubmit={onExport}
          onCancel={onClose}
        />
      </Modal>

      <Modal
        opened={dialog === 'erasure'}
        onClose={() => !busy && onClose()}
        title={t('settings.privacy.erase.modalTitle')}
      >
        <Text size="sm" mb="md">
          {t('settings.privacy.erase.modalBody')}
        </Text>
        <PrivacyCredentialsForm
          requiresTotp={requiresTotp}
          withReason
          destructive
          busy={busy}
          error={dialogError}
          submitLabel={t('settings.privacy.erase.submit')}
          onSubmit={onRequestErasure}
          onCancel={onClose}
        />
      </Modal>
    </GameCard>
  );
}

const readJson = async (response: Response) =>
  response.json().catch(() => ({}) as Record<string, unknown>);

/** Live "Your data" card for the settings page. */
export function PrivacyControlsCard({
  requiresTotp,
}: {
  requiresTotp: boolean;
}) {
  const { t, i18n } = useTranslation('home');
  const [erasure, setErasure] = useState<ErasureStateView | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const response = await fetch('/api/account/erasure');
      if (response.ok) setErasure(await response.json());
    } catch (error) {
      logError(error);
    }
  }, []);
  useEffect(() => {
    loadState();
  }, [loadState]);

  const errorText = useCallback(
    (code: unknown) => {
      const key = typeof code === 'string' ? ERROR_KEYS[code] : undefined;
      return t(key ?? 'settings.privacy.errors.generic');
    },
    [t],
  );

  const close = () => {
    setDialog(null);
    setDialogError(null);
  };

  const runExport = async (credentials: PrivacyCredentials) => {
    setBusy(true);
    setDialogError(null);
    try {
      const response = await fetch('/api/account/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: credentials.password,
          totpToken: credentials.totpToken,
        }),
      });
      if (!response.ok) {
        const body = await readJson(response);
        if (body.error === 'rate_limited' && typeof body.retryAt === 'string') {
          close();
          setExportNotice(
            t('settings.privacy.download.rateLimited', {
              time: new Date(body.retryAt).toLocaleString(i18n.language),
            }),
          );
          return;
        }
        setDialogError(
          errorText(
            body.error ??
              (response.status === 429 ? 'rate_limited' : undefined),
          ),
        );
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'openthrone-data.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportNotice(t('settings.privacy.download.done'));
      close();
    } catch (error) {
      logError(error);
      setDialogError(t('settings.privacy.download.failed'));
    } finally {
      setBusy(false);
    }
  };

  const runErasure = async (credentials: PrivacyCredentials) => {
    setBusy(true);
    setDialogError(null);
    try {
      const response = await fetch('/api/account/erasure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const body = await readJson(response);
      if (!response.ok) {
        setDialogError(
          errorText(
            body.error ??
              (response.status === 429 ? 'rate_limited' : undefined),
          ),
        );
        return;
      }
      setErasure(body as unknown as ErasureStateView);
      alertService.success(t('settings.privacy.erase.sent'));
      close();
    } catch (error) {
      logError(error);
      setDialogError(t('settings.privacy.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/account/erasure', {
        method: 'DELETE',
      });
      if (response.ok) {
        setErasure(await response.json());
        alertService.success(t('settings.privacy.erase.withdrawn'));
      } else {
        alertService.error(t('settings.privacy.errors.generic'));
      }
    } catch (error) {
      logError(error);
      alertService.error(t('settings.privacy.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PrivacyControlsView
      erasure={erasure}
      requiresTotp={requiresTotp}
      busy={busy}
      dialog={dialog}
      dialogError={dialogError}
      exportNotice={exportNotice}
      onOpen={(next) => {
        setDialogError(null);
        setDialog(next);
      }}
      onClose={close}
      onExport={runExport}
      onRequestErasure={runErasure}
      onWithdraw={withdraw}
    />
  );
}
