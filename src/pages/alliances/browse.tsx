import { useEffect, useState } from 'react';
import { Avatar, Text, Group, Button, SimpleGrid, Image, Box, Stack } from '@mantine/core';
import toLocale from '@/utils/numberFormatting';
import MainArea from '@/components/MainArea';
import { logError } from '@/utils/logger';
import { GameCard } from '@/components/game/GameCard';

export const UserCardImage = ({ name, members, description, gold, joinText, imgsrc, bannerimgsrc }) => {
  return (
    <GameCard title={name}>
      <Stack gap="md">
        <Box
          style={{
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid #2f3e52',
          }}
        >
          <Image src={bannerimgsrc} alt={name} fit="cover" h={140} />
        </Box>
        <Group justify="center" mt={-40}>
          <Avatar
            src={imgsrc}
            size={96}
            radius={96}
            style={{ border: '2px solid #1f2b3b', boxShadow: '0 6px 16px rgba(0,0,0,0.6)' }}
          />
        </Group>
        <Text ta="center" fz="sm" c="dimmed">
          {description}
        </Text>
        <Group
          justify="space-between"
          style={{
            backgroundColor: '#0f141a',
            borderRadius: '6px',
            border: '1px solid #1f2b3b',
            boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
            padding: '12px',
          }}
        >
          <div>
            <Text size="xs" c="dimmed" tt="uppercase">Gold</Text>
            <Text fw={700}>{toLocale(gold)}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed" tt="uppercase">Members</Text>
            <Text fw={700}>{toLocale(members)}</Text>
          </div>
        </Group>
        <Button fullWidth radius="sm" size="sm" color="yellow">
          {joinText || 'Join'}
        </Button>
      </Stack>
    </GameCard>
  );
};

const Browse = (props) => {
  const [alliances, setAlliances] = useState([]);

  useEffect(() => {
    const fetchAlliances = async () => {
      try {
        const response = await fetch('/api/alliances/getAll');
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        setAlliances(data);
      } catch (error) {
        logError('Failed to fetch alliances:', error);
      }
    };

    fetchAlliances();
  }, []);

  return (
    <MainArea title="Alliances">
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 3 }}>
        {alliances.map((alliance) => (
          <UserCardImage
            key={alliance.id}
            name={alliance.name}
            description={alliance.motto}
            members={alliance._count.members}
            gold={0}
            joinText="Join"
            imgsrc={alliance.avatar || '/path/to/default/avatar.png'}
            bannerimgsrc={alliance.bannerimg || '/path/to/default/banner.png'}
          />
        ))}
      </SimpleGrid>
    </MainArea>
  );
};

export default Browse;
