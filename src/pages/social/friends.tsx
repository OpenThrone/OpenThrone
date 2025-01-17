import React, { useState, useEffect } from 'react';
import { Table, Loader, Group, Paper, Avatar, Badge, Text, Indicator } from '@mantine/core';
import UserModel from '@/models/Users';
import Link from 'next/link';
import MainArea from '@/components/MainArea';

const Friends = (props) => {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/social/listAll?type=FRIEND')
      .then(response => response.json())
      .then(data => {
        setFriends(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <Loader />;

  const rows = friends.map(friend => {

    const player = new UserModel(friend.friend);
    return (
      <Table.Tr key={player.id}>
        <Table.Td>
          <Group
            gap={'sm'}
            className='text-justify'
          >
            <Indicator color={player.is_online ? 'teal' : 'red'} >
              <Avatar src={player?.avatar} size={40} radius={40} />
            </Indicator>
            <div>
              <Text fz='med' fw={500}>
                <Link
                  href={`/userprofile/${player.id}`}
                  className='text-blue-500 hover:text-blue-700 font-bold'
                >
                  {player.displayName}
                </Link>
                {player.is_player && <Badge color='blue' ml={5}>You</Badge>}
              </Text>
              <Text fz='xs' c='dimmed'>
                {player.race} {player.class}
              </Text>
            </div>
          </Group>
        </Table.Td>
        <Table.Td>{friend.acceptanceDate}</Table.Td>
      </Table.Tr>
    )
  });

  return (
    <MainArea title="Friends">
      <Paper shadow="xs" p="md">
        <Table className="min-w-full" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Username</Table.Th>
              <Table.Th>Since</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </Paper>
    </MainArea>
  );
};

export default Friends;