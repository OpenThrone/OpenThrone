import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import { GameCard } from '@/components/game/GameCard';
import { alertService } from '@/services/Alert.service';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('load');
  return res.json();
};

async function send(url: string, init: RequestInit) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/** Invitations waiting for the signed-in player (My Alliances). */
export const MyAllianceInvites = () => {
  const { t } = useTranslation('alliances');
  const router = useRouter();
  const { data, mutate } = useSWR<any[]>('/api/alliances/invites', fetcher);
  const [busy, setBusy] = useState<number | null>(null);
  if (!Array.isArray(data) || data.length === 0) return null;

  const respond = async (inviteId: number, accept: boolean) => {
    setBusy(inviteId);
    try {
      await send('/api/alliances/invites/respond', {
        method: 'POST',
        body: JSON.stringify({ inviteId, accept }),
      });
      alertService.success(t(accept ? 'invites.accepted' : 'invites.declined'));
      await mutate();
      if (accept) router.replace(router.asPath);
    } catch (error) {
      alertService.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <GameCard title={t('invites.mineTitle')}>
      <Stack gap="sm">
        {data.map((invite) => (
          <Group key={invite.id} justify="space-between" wrap="wrap">
            <Stack gap={0}>
              <Text fw={700}>{invite.alliance?.name}</Text>
              {invite.alliance?.motto && (
                <Text size="sm" c="var(--ot-muted)">
                  {invite.alliance.motto}
                </Text>
              )}
            </Stack>
            <Group gap="xs">
              <Button
                size="xs"
                loading={busy === invite.id}
                onClick={() => respond(invite.id, true)}
              >
                {t('invites.accept')}
              </Button>
              <Button
                size="xs"
                variant="default"
                disabled={busy === invite.id}
                onClick={() => respond(invite.id, false)}
              >
                {t('invites.decline')}
              </Button>
            </Group>
          </Group>
        ))}
      </Stack>
    </GameCard>
  );
};

/** Invite a player and manage pending invitations (invite_member holders). */
export const AllianceInvitePanel = ({ allianceId }: { allianceId: number }) => {
  const { t } = useTranslation('alliances');
  const { data, mutate } = useSWR<any[]>(
    `/api/alliances/invites?allianceId=${allianceId}`,
    fetcher,
  );
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);

  const invite = async () => {
    if (!name.trim() || sending) return;
    setSending(true);
    try {
      await send('/api/alliances/invites', {
        method: 'POST',
        body: JSON.stringify({ allianceId, displayName: name.trim() }),
      });
      alertService.success(t('invites.sent', { name: name.trim() }));
      setName('');
      await mutate();
    } catch (error) {
      alertService.error((error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const cancel = async (inviteId: number) => {
    try {
      await send(`/api/alliances/invites?inviteId=${inviteId}`, {
        method: 'DELETE',
      });
      await mutate();
    } catch (error) {
      alertService.error((error as Error).message);
    }
  };

  return (
    <GameCard title={t('invites.title')}>
      <Group align="flex-end" gap="sm" wrap="nowrap">
        <TextInput
          label={t('invites.playerName')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') invite();
          }}
          maxLength={50}
          style={{ flex: 1 }}
        />
        <Button onClick={invite} loading={sending} disabled={!name.trim()}>
          {t('invites.send')}
        </Button>
      </Group>
      {Array.isArray(data) && data.length > 0 && (
        <Stack gap={6} mt="md">
          <Text size="sm" fw={700}>
            {t('invites.pending')}
          </Text>
          {data.map((pending) => (
            <Group key={pending.id} justify="space-between">
              <Text size="sm">{pending.user?.display_name}</Text>
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                onClick={() => cancel(pending.id)}
              >
                {t('invites.cancel')}
              </Button>
            </Group>
          ))}
        </Stack>
      )}
    </GameCard>
  );
};
