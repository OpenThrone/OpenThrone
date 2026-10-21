import { Box, Grid, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import classes from '@/components/AttackResults.module.css';
import { BattleResultBanner } from '@/components/BattleResultBanner';
import { FramedAvatar } from '@/components/FramedAvatar';
import type { PlayerRace } from '@/types/typings';
import { getAssetPath, getAvatarSrc } from '@/utils/utilities';

export type ReportPlayer = {
  id?: number;
  display_name?: string;
  avatar?: string;
  race?: string;
};

export type ParticipantHeaderProps = {
  player?: ReportPlayer;
  side: 'attacker' | 'defender';
  /** Role caption under the rule, e.g. Attacker or Spymaster. */
  role: string;
  /** Localised level line, e.g. "Level 12". */
  levelLabel: ReactNode;
  /** Level reached during this report, shown as "→ N". */
  levelTo?: number;
  avatarAlt: string;
  /** Accessible profile link label; omit to render a plain block. */
  profileLabel?: string;
};

/** Framed portrait, name, level and role of one side of a report. */
export function ParticipantHeader({
  player,
  side,
  role,
  levelLabel,
  levelTo,
  avatarAlt,
  profileLabel,
}: ParticipantHeaderProps) {
  const portrait = (
    <Box
      className={
        side === 'defender'
          ? `${classes.defenderAvatar} ${classes.portrait}`
          : classes.portrait
      }
    >
      <FramedAvatar
        frameSrc={getAssetPath(
          'avatarFrame',
          null,
          (player?.race as PlayerRace) || 'ELF',
        )}
        src={getAvatarSrc(
          player?.avatar || 'SHIELD',
          player?.race as PlayerRace,
          '150x150',
        )}
        alt={avatarAlt}
        size={240}
        insetX={40}
        insetY={58}
        objectFit="cover"
      />
    </Box>
  );
  const identity = (
    <Box className={classes.identity}>
      <Text className={classes.name}>{player?.display_name}</Text>
      <Text size="sm" c="dimmed" tt="uppercase" mt={6}>
        {levelLabel}
        {levelTo != null && (
          <Text component="span" size="sm" fw={700} c="var(--ot-heading)">
            {' '}
            → {levelTo}
          </Text>
        )}
      </Text>
      <Box mt="md" className={classes.rule} aria-hidden />
      <Text mt="sm" size="sm" className={classes.role}>
        {role}
      </Text>
    </Box>
  );
  const linked = profileLabel != null && player?.id != null;
  return (
    <Box
      className={`${classes.participant} ${classes[side]} ${classes.participantLink}`}
      component={linked ? Link : 'div'}
      href={linked ? `/userprofile/${player?.id}` : undefined}
      aria-label={linked ? profileLabel : undefined}
      data-linked={linked || undefined}
    >
      {side === 'attacker' ? (
        <>
          {portrait}
          {identity}
        </>
      ) : (
        <>
          {identity}
          {portrait}
        </>
      )}
    </Box>
  );
}

export type ReportBandProps = {
  /** Caption above the id, e.g. "Battle ID". */
  label: string;
  reportId: ReactNode;
  /** Follow-up actions; plain theme Buttons (fullWidth). */
  actions?: ReactNode;
};

/** Centre band between the participants: report id and follow-up actions. */
export function ReportBand({ label, reportId, actions }: ReportBandProps) {
  return (
    <Stack align="center" gap={8} className={classes.idBand}>
      <Text size="xs" tt="uppercase" c="dimmed" className={classes.idLabel}>
        {label}
      </Text>
      <Text size="xl" fw={700} className={classes.idValue}>
        {reportId}
      </Text>
      {actions && (
        <Stack gap={8} w="100%" mt={8}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}

export type ReportHeaderProps = {
  banner: ComponentProps<typeof BattleResultBanner>;
  attacker: ParticipantHeaderProps;
  defender: ParticipantHeaderProps;
  band: ReportBandProps;
};

/**
 * Outcome banner plus the attacker / report id / defender header shared by
 * battle and spy reports (#133).
 */
export function ReportHeader({
  banner,
  attacker,
  defender,
  band,
}: ReportHeaderProps) {
  return (
    <>
      <BattleResultBanner {...banner} />
      <Box className={classes.battleHeader}>
        <Grid align="center" gutter="xl" w="100%">
          <Grid.Col
            span={{ base: 12, md: 'auto' }}
            className={classes.participantColumn}
          >
            <ParticipantHeader {...attacker} />
          </Grid.Col>
          <Grid.Col
            span={{ base: 12, md: 'content' }}
            className={classes.battleId}
          >
            <ReportBand {...band} />
          </Grid.Col>
          <Grid.Col
            span={{ base: 12, md: 'auto' }}
            className={classes.participantColumn}
          >
            <ParticipantHeader {...defender} />
          </Grid.Col>
        </Grid>
      </Box>
    </>
  );
}
