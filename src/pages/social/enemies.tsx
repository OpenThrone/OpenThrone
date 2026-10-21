import { faSkullCrossbones } from '@fortawesome/free-solid-svg-icons';
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
import UserModel from '@/models/Users';
import { logError } from '@/utils/logger';

const Enemies = () => {
  const { t } = useTranslation('social');
  const [enemies, setEnemies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/social/listAll?type=ENEMY')
      .then((response) => response.json())
      .then((data) => {
        setEnemies(Array.isArray(data) ? data : []);
      })
      .catch((error) => logError('Failed to load enemies:', error))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <MainArea title={t('enemies.title')}>
        <PageLoading cardTitle={t('enemies.enemiesList')} block={false} />
      </MainArea>
    );
  }

  const rows = enemies.map((enemy) => {
    const player = enemy.friend
      ? new UserModel(enemy.friend, true, false)
      : null;
    return (
      <Table.Tr key={enemy.id}>
        <Table.Td>
          {player ? (
            <Group gap="sm" wrap="nowrap">
              <OnlineIndicator online={!!player.is_online}>
                <Avatar src={player.avatar} size={40} radius={40} />
              </OnlineIndicator>
              <div>
                <Anchor
                  component={Link}
                  href={`/userprofile/${player.id}`}
                  fz="md"
                  fw={700}
                >
                  {player.displayName}
                </Anchor>
                <PlayerIdentityLine
                  race={player.race}
                  playerClass={player.class}
                />
              </div>
            </Group>
          ) : (
            enemy.playerId
          )}
        </Table.Td>
        <Table.Td>{enemy.status}</Table.Td>
      </Table.Tr>
    );
  });

  return (
    <MainArea title={t('enemies.title')}>
      <GameCard title={t('enemies.enemiesList')}>
        {enemies.length === 0 ? (
          <EmptyState icon={faSkullCrossbones} title={t('enemies.noEnemies')} />
        ) : (
          <StyledTable headers={[t('friends.username'), t('enemies.status')]}>
            {rows}
          </StyledTable>
        )}
      </GameCard>
    </MainArea>
  );
};

export default Enemies;
