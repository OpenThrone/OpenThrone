import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  SimpleGrid,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { GameCard } from '@/components/game/GameCard';
import { date } from '@/components/supporter/SupporterParts';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import { useSupporterStatus } from '@/hooks/useSupporterStatus';
import type {
  DiscordLinkCodeResponse,
  DiscordLinkInfo,
  DiscordNotifyPrefs,
} from '@/types/supporter';

const commands = [
  'profile',
  'stats',
  'leaderboard',
  'fort',
  'myclan',
  'war',
  'link',
] as const;
const instant = ['attacks', 'spyHits', 'wars', 'turnCap'] as const;

export function DiscordLinkView({
  info,
  code,
  active,
  busy,
  error,
  onGenerate,
  onUnlink,
  onPrefs,
}: {
  info: DiscordLinkInfo;
  code: DiscordLinkCodeResponse | null;
  active: boolean;
  busy: boolean;
  error: boolean;
  onGenerate: () => void;
  onUnlink: () => void;
  onPrefs: (prefs: Partial<DiscordNotifyPrefs>) => void;
}) {
  const { t } = useTranslation('supporter');
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!code) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [code]);
  const allowed = info.allowedAlerts ?? [];
  const seconds = code
    ? Math.max(0, Math.ceil((new Date(code.expiresAt).getTime() - now) / 1000))
    : 0;
  return (
    <GameCard title={t('discord.title')}>
      <Stack gap="md">
        {info.linked ? (
          <>
            <Text>
              {t('discord.linked', {
                name: info.discordUsername,
                date: date(info.linkedAt),
              })}
            </Text>
            <Button variant="outline" onClick={() => setConfirm(true)}>
              {t('discord.unlink')}
            </Button>
          </>
        ) : (
          <>
            <Text>{t('discord.intro')}</Text>
            <ol>
              <li>{t('discord.step1')}</li>
              <li>
                <a
                  href="https://discord.com/invite/j9NYxmBCjA"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('discord.step2')}
                </a>
              </li>
              <li>{t('discord.step3')}</li>
              <li>{t('discord.step4')}</li>
            </ol>
            <Button color="indigo" loading={busy} onClick={onGenerate}>
              {t('discord.generate')}
            </Button>
            {code && (
              <Group>
                <Text fw={700}>{code.code}</Text>
                <Button
                  variant="outline"
                  disabled={!seconds}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(code.code);
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                >
                  {copied ? t('copied') : t('copy')}
                </Button>
                <Text aria-live="polite">
                  {t('discord.expires', { seconds })}
                </Text>
              </Group>
            )}
          </>
        )}
        {error && (
          <Alert role="alert" color="red">
            {t('error')}
          </Alert>
        )}
        {info.linked && (
          <>
            <Text fw={700}>{t('discord.notifications')}</Text>
            <Switch
              label={t('discord.dailyDigest')}
              checked={info.notifyPrefs.dailyDigest}
              disabled={busy}
              onChange={(e) =>
                onPrefs({ dailyDigest: e.currentTarget.checked })
              }
            />
            {instant.map((key) => (
              <Group key={key}>
                <Switch
                  label={t(`discord.${key}`)}
                  checked={info.notifyPrefs[key]}
                  disabled={busy || !allowed.includes(key)}
                  onChange={(e) => onPrefs({ [key]: e.currentTarget.checked })}
                />
                {!allowed.includes(key) && <Badge>{t('patron')}</Badge>}
              </Group>
            ))}
            <Group>
              {(['quietHoursStart', 'quietHoursEnd'] as const).map((key) => (
                <NumberInput
                  key={key}
                  label={t(`discord.${key}`)}
                  min={0}
                  max={23}
                  value={info.notifyPrefs[key] ?? ''}
                  disabled={busy || !allowed.length}
                  onChange={(value) =>
                    onPrefs({ [key]: value === '' ? null : Number(value) })
                  }
                />
              ))}
              <Badge>{t('patron')}</Badge>
            </Group>
            {!active && (
              <Text component={Link} href="/supporter">
                {t('discord.patronLink')}
              </Text>
            )}
          </>
        )}
        <Text fw={700}>{t('discord.commands')}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {commands.map((command) => (
            <Text key={command}>
              <strong>/{command}</strong> — {t(`discord.command.${command}`)}
            </Text>
          ))}
        </SimpleGrid>
        <Modal
          opened={confirm}
          onClose={() => setConfirm(false)}
          title={t('discord.unlink')}
        >
          <Stack>
            <Text>{t('discord.confirmUnlink')}</Text>
            <Group>
              <Button variant="default" onClick={() => setConfirm(false)}>
                {t('discord.cancel')}
              </Button>
              <Button
                color="red"
                loading={busy}
                onClick={() => {
                  setConfirm(false);
                  onUnlink();
                }}
              >
                {t('discord.unlink')}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </GameCard>
  );
}

export function DiscordLinkCard() {
  const { t } = useTranslation('supporter');
  const { data: supporter } = useSupporterStatus();
  const { config } = useRuntimeConfig();
  const {
    data,
    error: loadError,
    mutate,
  } = useSWR<DiscordLinkInfo | null>(
    // Discord linking is part of the supporter feature; skip it when off.
    config?.enableSupporter ? '/api/account/discord' : null,
    async (url: string) => {
      const response = await fetch(url);
      // 404: the supporter feature is switched off; show nothing.
      if (response.status === 404) return null;
      if (!response.ok) throw new Error();
      return response.json();
    },
  );
  const [code, setCode] = useState<DiscordLinkCodeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const request = async (url: string, method: string, body?: object) => {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(url, {
        method,
        ...(body
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
      });
      if (!response.ok) throw new Error();
      if (url.endsWith('/link-code')) setCode(await response.json());
      else {
        setCode(null);
        await mutate();
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  if (loadError)
    return (
      <Alert color="red" role="alert">
        {t('loadError')}
      </Alert>
    );
  if (!data) return null;
  return (
    <DiscordLinkView
      info={data}
      code={code}
      active={!!supporter?.isActive}
      busy={busy}
      error={error}
      onGenerate={() => request('/api/account/discord/link-code', 'POST')}
      onUnlink={() => request('/api/account/discord', 'DELETE')}
      onPrefs={(prefs) =>
        request('/api/account/discord', 'PATCH', {
          notifyPrefs: { ...data.notifyPrefs, ...prefs },
        })
      }
    />
  );
}
