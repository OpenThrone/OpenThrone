import { Anchor, Avatar, Box, Group } from '@mantine/core';
import Link from 'next/link';
import type { FC } from 'react';

import panelClasses from '@/components/game/Panels.module.css';
import OnlineIndicator from '@/components/player/OnlineIndicator';
import PlayerIdentityLine from '@/components/player/PlayerIdentityLine';
import YouBadge from '@/components/player/YouBadge';
import type UserModel from '@/models/Users';
import { logDebug } from '@/utils/logger';

interface FriendCardProps {
  player: UserModel;
}

const FriendCard: FC<FriendCardProps> = ({ player }) => {
  logDebug(
    `Rendering FriendCard for player: ${player.displayName} (${player.id}) - Online: ${player.is_online}`,
  );
  return (
    <Box className={panelClasses.insetRow}>
      <OnlineIndicator
        online={!!player.is_online}
        style={{ display: 'block', textAlign: 'center' }}
      >
        <Avatar src={player?.avatar} size={40} radius={40} mx="auto" />
      </OnlineIndicator>
      <Group gap={5} justify="center" mt="md">
        <Anchor
          component={Link}
          href={`/userprofile/${player.id}`}
          size="sm"
          fw={700}
        >
          {player.displayName}
        </Anchor>
        {player.is_player && <YouBadge />}
      </Group>
      <PlayerIdentityLine
        race={player.race}
        playerClass={player.class}
        ta="center"
      />
    </Box>
  );
};

export default FriendCard;
