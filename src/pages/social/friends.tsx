import { faUserGroup } from '@fortawesome/free-solid-svg-icons';
import { Anchor, Avatar, Group, Table } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';

import { EmptyState } from '@/components/game/EmptyState';
import { GameCard } from '@/components/game/GameCard';
import { PageLoading } from '@/components/game/PageLoading';
import { StyledTable } from '@/components/game/StyledTable';
import MainArea from '@/components/MainArea';
import OnlineIndicator from '@/components/player/OnlineIndicator';
import PlayerIdentityLine from '@/components/player/PlayerIdentityLine';
import YouBadge from '@/components/player/YouBadge';
import UserModel from '@/models/Users';
import { logError } from '@/utils/logger';

const Friends = () => {
  const { t } = useTranslation('social');
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/social/listAll?type=FRIEND')
      .then((response) => response.json())
      .then((data) => {
        setFriends(Array.isArray(data) ? data : []);
      })
      .catch((error) => logError('Failed to load friends:', error))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <MainArea title={t('friends.title')}>
        <PageLoading cardTitle={t('friends.friendsList')} block={false} />
      </MainArea>
    );
  }

  const rows = friends.map((friend) => {
    const player = new UserModel(friend.friend, true, false);
    return (
      <Table.Tr key={player.id}>
        <Table.Td>
          <Group gap="sm" className="text-justify">
            <OnlineIndicator online={!!player.is_online}>
              <Avatar src={player?.avatar} size={40} radius={40} />
            </OnlineIndicator>
            <div>
              <Group gap={5}>
                <Anchor
                  component={Link}
                  href={`/userprofile/${player.id}`}
                  fz="md"
                  fw={700}
                >
                  {player.displayName}
                </Anchor>
                {player.is_player && <YouBadge />}
              </Group>
              <PlayerIdentityLine
                race={player.race}
                playerClass={player.class}
              />
            </div>
          </Group>
        </Table.Td>
        <Table.Td>{friend.acceptanceDate}</Table.Td>
      </Table.Tr>
    );
  });

  return (
    <MainArea title={t('friends.title')}>
      <GameCard title={t('friends.friendsList')}>
        {friends.length === 0 ? (
          <EmptyState icon={faUserGroup} title={t('friends.noFriends')} />
        ) : (
          <StyledTable headers={[t('friends.username'), t('friends.since')]}>
            {rows}
          </StyledTable>
        )}
      </GameCard>
    </MainArea>
  );
};

export default Friends;
