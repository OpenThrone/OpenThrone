import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import type {
  ReportShareAction,
  ReportSharingState,
} from '@/services/ReportSharing.service';

export interface SharePlayer {
  id: number;
  display_name: string;
}

/** Shared form for live sharing and API-free design-guide scenarios. */
export function ReportSharingControls({
  state,
  players = [],
  search = '',
  onSearch,
  onAction,
  onAllianceDetails,
  busy = false,
  error = '',
  searching = false,
}: {
  state: ReportSharingState;
  players?: SharePlayer[];
  search?: string;
  onSearch: (value: string) => void;
  onAction: (action: ReportShareAction) => Promise<void>;
  onAllianceDetails?: (allianceId: number) => void;
  busy?: boolean;
  error?: string;
  searching?: boolean;
}) {
  const { t } = useTranslation('battle');
  const [audience, setAudience] = useState<string | null>('player');
  const [player, setPlayer] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<SharePlayer | null>(
    null,
  );
  const playerOptions =
    selectedPlayer && !players.some((p) => p.id === selectedPlayer.id)
      ? [selectedPlayer, ...players]
      : players;
  const [alliance, setAlliance] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Stack gap="md">
      <Text size="sm" c="var(--ot-muted)">
        {t('sharing.participantsOnly')}
      </Text>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <Select
        label={t('sharing.audience')}
        value={audience}
        onChange={setAudience}
        allowDeselect={false}
        data={['player', 'alliance', 'public'].map((value) => ({
          value,
          label: t(`sharing.${value}`),
        }))}
        disabled={busy}
      />
      {audience === 'player' && (
        <Stack gap="xs">
          <Select
            label={t('sharing.findPlayer')}
            placeholder={t('sharing.selectPlayer')}
            searchable
            clearable
            searchValue={search}
            onSearchChange={(value) => {
              onSearch(value);
              if (value !== selectedPlayer?.display_name) {
                setPlayer(null);
                setSelectedPlayer(null);
              }
            }}
            value={player}
            onChange={(value) => {
              setPlayer(value);
              setSelectedPlayer(
                playerOptions.find((p) => String(p.id) === value) ?? null,
              );
            }}
            data={playerOptions.map((p) => ({
              value: String(p.id),
              label: p.display_name,
            }))}
            filter={({ options }) => options}
            nothingFoundMessage={t(
              searching
                ? 'sharing.searchingPlayers'
                : search.trim().length < 2
                  ? 'sharing.findPlayer'
                  : 'sharing.noPlayers',
            )}
            rightSection={
              searching ? (
                <Loader size="xs" aria-label={t('sharing.searchingPlayers')} />
              ) : undefined
            }
            comboboxProps={{ withinPortal: false }}
            disabled={busy}
          />
          <Button
            disabled={!player || busy}
            loading={busy}
            onClick={async () => {
              if (player)
                await onAction({ action: 'player', userId: Number(player) });
            }}
          >
            {t('sharing.grant')}
          </Button>
        </Stack>
      )}
      {audience === 'alliance' && (
        <Stack gap="xs">
          <Select
            label={t('sharing.alliance')}
            value={alliance}
            onChange={setAlliance}
            placeholder={t('sharing.selectAlliance')}
            data={state.alliances.map((a) => ({
              value: String(a.id),
              label: a.name,
            }))}
            disabled={busy}
          />
          <Text size="sm" c="var(--ot-muted)">
            {t(
              state.alliances.length
                ? 'sharing.membershipBound'
                : 'sharing.noAlliances',
            )}
          </Text>
          <Button
            disabled={!alliance || busy}
            loading={busy}
            onClick={async () => {
              if (alliance)
                await onAction({
                  action: 'alliance',
                  allianceId: Number(alliance),
                });
            }}
          >
            {t('sharing.grant')}
          </Button>
          {onAllianceDetails &&
            alliance &&
            !state.alliances.find((a) => a.id === Number(alliance))
              ?.alreadyShared && (
              <Button
                variant="subtle"
                disabled={busy}
                onClick={() => onAllianceDetails(Number(alliance))}
              >
                {t('sharing.addDetails')}
              </Button>
            )}
        </Stack>
      )}
      {audience === 'public' && (
        <Stack gap="sm">
          <Alert color={state.isPublic ? 'blue' : 'yellow'}>
            {t('sharing.publicWarning')}
          </Alert>
          {!state.isPublic && (
            <Checkbox
              label={t('sharing.confirmPublic')}
              checked={confirmed}
              onChange={(e) => setConfirmed(e.currentTarget.checked)}
              disabled={busy}
            />
          )}
          <Button
            color={state.isPublic ? 'red' : undefined}
            disabled={busy || (!state.isPublic && !confirmed)}
            loading={busy}
            onClick={async () => {
              await onAction({ action: 'public', enabled: !state.isPublic });
            }}
          >
            {t(state.isPublic ? 'sharing.stopPublic' : 'sharing.makePublic')}
          </Button>
        </Stack>
      )}
      <Divider />
      <Group justify="space-between">
        <Text fw={600}>{t('sharing.access')}</Text>
        <Badge variant="light" color={state.isPublic ? 'blue' : 'gray'}>
          {t(state.isPublic ? 'sharing.public' : 'sharing.restricted')}
        </Badge>
      </Group>
      <Text size="sm" c="var(--ot-muted)">
        {t('sharing.permanentParticipants')}
      </Text>
      {state.grants.map((grant) => (
        <Group key={grant.id} justify="space-between" wrap="nowrap">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text style={{ overflowWrap: 'anywhere' }}>{grant.name}</Text>
            <Text size="xs" c="var(--ot-muted)">
              {t(`sharing.${grant.kind}`)}
            </Text>
          </Stack>
          <Button
            size="compact-sm"
            variant="subtle"
            color="red"
            disabled={busy}
            aria-label={t('sharing.revokeNamed', { name: grant.name })}
            onClick={async () => {
              await onAction({ action: 'revoke', grantId: grant.id });
            }}
          >
            {t('sharing.revoke')}
          </Button>
        </Group>
      ))}
      {!state.grants.length && (
        <Text size="sm" c="var(--ot-muted)">
          {t('sharing.noGrants')}
        </Text>
      )}
      <Text size="xs" c="var(--ot-muted)">
        {t('sharing.independentAccess')}
      </Text>
    </Stack>
  );
}
