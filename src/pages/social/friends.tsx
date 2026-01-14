import React, { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';

import Link from 'next/link';
import { Table, Loader, Group, Avatar, Badge, Text, Indicator } from '@mantine/core';
import MainArea from '@/components/MainArea';
import UserModel from '@/models/Users';
import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';

const Friends = (props) => {
  const { t } = useTranslation('social');
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

  if (loading) {
    return (
      <MainArea title={t('friends.title')}>
        <GameCard title={t('friends.title')}>
          <Loader />
        </GameCard>
      </MainArea>
    );
  }

  const rows = friends.map(friend => {
    const player = new UserModel(friend.friend, true, false);
    return (
      <Table.Tr key={player.id} style={{ background: '#0f141a' }}>
        <Table.Td style={{ borderColor: '#1f2b3b' }}>
          <Group
            gap={'sm'}
            className='text-justify'
          >
            <Indicator color={player.is_online ? 'teal' : 'red'} >
              <Avatar src={player?.avatar} size={40} radius={40} />
            </Indicator>
            <div>
              <Text fz='md' fw={500}>
                <Link
                  href={`/userprofile/${player.id}`}
                  className='text-blue-500 hover:text-blue-700 font-bold'
                >
                  {player.displayName}
                </Link>
                {player.is_player && <Badge color='blue' ml={5}>{t('friends.you')}</Badge>}
              </Text>
              <Text fz='xs' c='dimmed'>
                {player.race} {player.class}
              </Text>
            </div>
          </Group>
        </Table.Td>
        <Table.Td style={{ borderColor: '#1f2b3b' }}>{friend.acceptanceDate}</Table.Td>
      </Table.Tr>
    );
  });

  return (
    <MainArea title={t('friends.title')}>
      <GameCard title={t('friends.friendsList')}>
        <StyledTable headers={[t('friends.username'), t('friends.since')]}>
          {rows}
        </StyledTable>
      </GameCard>
    </MainArea>
  );
};

export default Friends;
