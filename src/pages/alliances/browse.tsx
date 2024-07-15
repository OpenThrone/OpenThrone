import { Card, Avatar, Text, Group, Button, SimpleGrid, Image } from '@mantine/core';
import classes from './browse.module.css';
import toLocale from '@/utils/numberFormatting';
import { useEffect, useState } from 'react';

import Alert from '@/components/alert';

export const UserCardImage = ({ name, members, description, gold, joinText, imgsrc, bannerimgsrc }) => {
  return (
    <Card withBorder padding="xl" radius="md" className={classes.card}>
      <Card.Section>
        <Image src={bannerimgsrc} alt={name} fit='none' style={{ height: '140px' }} width={'100%'} />
      </Card.Section>
      <Avatar
        src={imgsrc}
        size={120}
        radius={120}
        mx="auto"
        mt={-30}
        className={classes.avatar}
        
      />
      <Text ta="center" fz="lg" fw={500} mt="sm">
        {name}
      </Text>
      <Text ta="center" fz="sm" c="dimmed">
        {description}
      </Text>
      <Group mt="md" justify="center" gap={30}>
        <div>
          <Text ta="center" fz="lg" fw={500}>
            {toLocale(gold)}
          </Text>
          <Text ta="center" fz="sm" c="dimmed" lh={1}>
            Gold
          </Text>
          <Text ta="center" fz="lg" fw={500}>
            {toLocale(members)}
          </Text>
          <Text ta="center" fz="sm" c="dimmed" lh={1}>
            Members
          </Text>
        </div>
      </Group>
      <Button fullWidth radius="md" mt="xl" size="md" variant="default">
        {joinText || 'Join'}
      </Button>
    </Card>
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

        console.log('alliances: ',data)
      } catch (error) {
        console.error('Failed to fetch alliances:', error);
      }
    };

    fetchAlliances();
  }, []);

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">Alliances</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
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
    </div>
  );
};

export default Browse;
