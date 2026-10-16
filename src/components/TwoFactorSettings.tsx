import {
  Alert,
  Button,
  Code,
  Group,
  Image,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { logError } from '@/utils/logger';

type Setup = { secret: string; qrCode: string; setupToken: string };

type Props = { enabled: boolean; onChange: () => void; recommended?: boolean };

/** Enrollment stays pending until an authenticator code is confirmed. */
export default function TwoFactorSettings({
  enabled,
  onChange,
  recommended,
}: Props) {
  const { t } = useTranslation('home');
  const [active, setActive] = useState(enabled);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => setActive(enabled), [enabled]);

  const begin = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/account/enable-2fa', {
        method: 'POST',
      });
      const data = await response.json().catch(() => null);
      if (
        !response.ok ||
        typeof data?.secret !== 'string' ||
        typeof data?.qrCode !== 'string' ||
        typeof data?.setupToken !== 'string'
      ) {
        setError(t('settings.failedToGenerate2FASecret'));
        return;
      }
      setSetup(data);
      setCode('');
    } catch (cause) {
      logError('Failed to start 2FA enrollment:', cause);
      setError(t('settings.failedToGenerate2FASecret'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!setup || busy || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: code, setupToken: setup.setupToken }),
      });
      if (!response.ok) {
        setError(t('settings.twoFactorSetupFailed'));
        return;
      }
      setActive(true);
      setSetup(null);
      setCode('');
      setSuccess(t('settings.2FAEnabled'));
      onChange();
    } catch (cause) {
      logError('Failed to verify 2FA enrollment:', cause);
      setError(t('settings.twoFactorSetupFailed'));
    } finally {
      setBusy(false);
    }
  };

  const disable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!password && !/^\d{6}$/.test(disableCode)) {
      setError(t('settings.disable2FAProofRequired'));
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/account/disable-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          password ? { password } : { totpCode: disableCode },
        ),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const serverMessage = typeof data?.error === 'string' ? data.error : '';
        setError(
          response.status === 409
            ? t('settings.twoFactorRequired')
            : serverMessage || t('settings.failedToDisable2FA'),
        );
        return;
      }
      setActive(false);
      setPassword('');
      setDisableCode('');
      setSuccess(t('settings.twoFactorDisabled'));
      onChange();
    } catch (cause) {
      logError('Failed to disable 2FA:', cause);
      setError(t('settings.failedToDisable2FA'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="md">
      <Text size="sm">
        {t(
          active
            ? 'settings.twoFactorActive'
            : 'settings.twoFactorIntroduction',
        )}
      </Text>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      {success && (
        <Text role="status" size="sm">
          {success}
        </Text>
      )}
      {setup ? (
        <form onSubmit={verify}>
          <Stack gap="md">
            <Text size="sm">{t('settings.twoFactorScan')}</Text>
            <Image
              src={setup.qrCode}
              alt={t('settings.twoFactorQrAlt')}
              w={200}
              h={200}
            />
            <Text size="sm">{t('settings.twoFactorManualKey')}</Text>
            <Code
              block
              style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}
            >
              {setup.secret}
            </Code>
            <Text size="sm">{t('settings.twoFactorExpires')}</Text>
            <TextInput
              label={t('settings.enter6DigitCode')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) =>
                setCode(event.currentTarget.value.replace(/\D/g, ''))
              }
              disabled={busy}
              required
            />
            <Group>
              <Button type="submit" loading={busy} disabled={code.length !== 6}>
                {t('settings.verify')}
              </Button>
              <Button
                type="button"
                variant="subtle"
                disabled={busy}
                onClick={() => {
                  setSetup(null);
                  setCode('');
                  setError('');
                }}
              >
                {t('settings.twoFactorCancel')}
              </Button>
            </Group>
          </Stack>
        </form>
      ) : active ? (
        <form onSubmit={disable}>
          <Stack gap="md">
            <PasswordInput
              label={t('settings.disable2FAPassword')}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              disabled={busy}
            />
            <TextInput
              label={t('settings.disable2FACode')}
              description={t('settings.disable2FACodeHint')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={disableCode}
              onChange={(event) =>
                setDisableCode(event.currentTarget.value.replace(/\D/g, ''))
              }
              disabled={busy}
            />
            <Group>
              <Button type="submit" variant="outline" loading={busy}>
                {t('settings.disable2FA')}
              </Button>
            </Group>
          </Stack>
        </form>
      ) : (
        <Button autoFocus={recommended} loading={busy} onClick={begin}>
          {t('settings.enable2FA')}
        </Button>
      )}
    </Stack>
  );
}
