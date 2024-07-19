import { Paper, Avatar, Text, Indicator, Badge } from '@mantine/core';
import Link from 'next/link';
import UserModel from '@/models/Users';

interface FriendCardProps {
  player: UserModel;
}

const FriendCard: React.FC<FriendCardProps> = ({ player }) => (
  <Paper key={player.id} radius="md" withBorder p="lg" className="my-3">
    <Indicator color={player.is_online ? 'teal' : 'red'} style={{ display: 'block', textAlign: 'center' }}>
      <Avatar src={player?.avatar} size={40} radius={40} mx="auto" />
    </Indicator>
    <Text size="sm" weight={500} align="center" mt="md">
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
    <Text size="xs" color="dimmed" align="center">
      {player.race} {player.class}
    </Text>
  </Paper>
);

export default FriendCard;
