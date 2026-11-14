import { Anchor, Button, Group, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import {
  AllianceJoinTerms,
  duesTermsOf,
  hasDues,
  joinTermsMessage,
} from '@/components/alliance/AllianceMembershipDues';
import { useAllianceUpgradeStatus } from '@/components/alliance/AllianceUpgrades';
import { PlayerNameAutocomplete } from '@/components/alliance/PlayerNameAutocomplete';
import ConfirmationModal from '@/components/ConfirmationModal';
import { GameCard } from '@/components/game/GameCard';
import {
  allianceLevelNameKey,
  allianceUpgradesHref,
  getAllianceLevel,
} from '@/constants/allianceLevels';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { Locales } from '@/types/typings';
import { allianceApiError } from '@/utils/allianceErrorMessage';

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
  if (!res.ok) throw allianceApiError(data, res.status);
  return data;
}

/** Invitations waiting for the signed-in player (My Alliances). */
export const MyAllianceInvites = () => {
  const { t, i18n } = useTranslation('alliances');
  const { forceUpdate } = useUser();
  const locale = i18n.language as Locales;
  const router = useRouter();
  const { data, mutate } = useSWR<any[]>('/api/alliances/invites', fetcher);
  const [busy, setBusy] = useState<number | null>(null);
  // Accepting an invitation with a fee or dues is confirmed first.
  const [confirming, setConfirming] = useState<any | null>(null);
  if (!Array.isArray(data) || data.length === 0) return null;

  const respond = async (
    inviteId: number,
    accept: boolean,
    expectedFee?: bigint,
  ) => {
    setBusy(inviteId);
    try {
      await send('/api/alliances/invites/respond', {
        method: 'POST',
        body: JSON.stringify({
          inviteId,
          accept,
          ...(accept && expectedFee !== undefined
            ? { expectedFee: Number(expectedFee) }
            : {}),
        }),
      });
      alertService.success(t(accept ? 'invites.accepted' : 'invites.declined'));
      await mutate();
      if (accept) {
        forceUpdate?.();
        router.replace(router.asPath);
      }
    } catch (error) {
      alertService.error((error as Error).message);
      // A changed join fee is shown again before the player retries.
      await mutate();
    } finally {
      setBusy(null);
    }
  };

  const accept = (invite: any) => {
    const terms = duesTermsOf(invite.alliance ?? {});
    if (terms.joinFee > 0n || hasDues(terms)) {
      setConfirming(invite);
      return;
    }
    respond(invite.id, true, terms.joinFee);
  };
  const confirmingTerms = confirming
    ? duesTermsOf(confirming.alliance ?? {})
    : null;

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
              {/* Like the directory card: no line when there is nothing to pay. */}
              {(duesTermsOf(invite.alliance ?? {}).joinFee > 0n ||
                hasDues(duesTermsOf(invite.alliance ?? {}))) && (
                <AllianceJoinTerms
                  terms={duesTermsOf(invite.alliance ?? {})}
                  size="xs"
                />
              )}
            </Stack>
            <Group gap="xs">
              <Button
                size="xs"
                loading={busy === invite.id}
                onClick={() => accept(invite)}
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
      <ConfirmationModal
        isOpen={confirming !== null}
        onClose={() => busy === null && setConfirming(null)}
        onConfirm={async () => {
          if (!confirming || !confirmingTerms) return;
          await respond(confirming.id, true, confirmingTerms.joinFee);
          setConfirming(null);
        }}
        title={t('memberDues.confirmTitle', {
          name: confirming?.alliance?.name ?? '',
        })}
        message={
          confirming && confirmingTerms
            ? joinTermsMessage(
                t,
                confirming.alliance?.name ?? '',
                confirmingTerms,
                locale,
              )
            : ''
        }
        type="primary"
        confirmText={t('invites.accept')}
        cancelText={t('manage.cancel', 'Cancel')}
        isLoading={confirming !== null && busy === confirming.id}
      />
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
  const { data: hall } = useAllianceUpgradeStatus(allianceId);
  const level = getAllianceLevel(hall?.hallLevel);
  const full = !!hall && hall.memberCount >= level.maxMembers;

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
      {hall && (
        <Text size="sm" mb="sm" c={full ? 'orange' : 'var(--ot-muted)'}>
          {t(full ? 'invites.capFull' : 'invites.cap', {
            members: hall.memberCount,
            cap: level.maxMembers,
            level: t(allianceLevelNameKey(level.level), level.name),
          })}{' '}
          <Anchor
            component={Link}
            href={allianceUpgradesHref(allianceId)}
            scroll={false}
            size="sm"
          >
            {t('upgrades.raiseLink')}
          </Anchor>
        </Text>
      )}
      <Group align="flex-end" gap="sm" wrap="nowrap">
        <PlayerNameAutocomplete
          label={t('invites.playerName')}
          value={name}
          onChange={setName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') invite();
          }}
          maxLength={50}
          style={{ flex: 1 }}
        />
        <Button
          onClick={invite}
          loading={sending}
          disabled={!name.trim() || full}
        >
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
