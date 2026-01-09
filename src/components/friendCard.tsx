import type { FC } from 'react';
import Link from 'next/link';
import { Avatar, Badge, Box, Indicator, Text } from '@mantine/core';

import UserModel from '@/models/Users';
import { logDebug } from '@/utils/logger';

interface FriendCardProps {
  player: UserModel;
}

const FriendCard: FC<FriendCardProps> = ({ player }) => {
  logDebug(`Rendering FriendCard for player: ${player.displayName} (${player.id}) - Online: ${player.is_online}`);
  return (
    <Box
      style={{
        backgroundColor: '#0f141a',
        borderRadius: '6px',
        border: '1px solid #1f2b3b',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
        padding: '12px',
      }}
    >
      <Indicator color={player.is_online ? 'teal' : 'red'} style={{ display: 'block', textAlign: 'center' }}>
        <Avatar src={player?.avatar} size={40} radius={40} mx="auto" />
      </Indicator>
      <Text size="sm" fw={500} ta="center" mt="md">
        <Link
          href={`/userprofile/${player.id}`}
          className='text-blue-500 hover:text-blue-700 font-bold'
        >
          {player.displayName}
        </Link>
        {player.is_player && <Badge color={(player.colorScheme === "ELF") ?
          'green' : (
            player.colorScheme === 'GOBLIN' ? 'red' : (
              player.colorScheme === 'UNDEAD' ? 'dark'
                : 'blue'
            ))} ml={5}>You</Badge>}
      </Text>
      <Text size="xs" c="dimmed" ta="center">
        {player.race} {player.class}
      </Text>
    </Box>
  );
};

export default FriendCard;
