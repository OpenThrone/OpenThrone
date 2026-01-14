import React, { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';

import { Table, Loader } from '@mantine/core';
import { getSafeLocale } from '@/utils/i18n';

import MainArea from '@/components/MainArea';
import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';

const Enemies = (props) => {
  const { t } = useTranslation('social');
  const [enemies, setEnemies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/social/listAll?type=ENEMY')
      .then(response => response.json())
      .then(data => {
        setEnemies(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <MainArea title={t('enemies.title')}>
        <GameCard title={t('enemies.title')}>
          <Loader />
        </GameCard>
      </MainArea>
    );
  }

  const rows = enemies.map(enemy => (
    <Table.Tr key={enemy.id} style={{ background: '#0f141a' }}>
      <Table.Td style={{ borderColor: '#1f2b3b' }}>{enemy.playerId}</Table.Td>
      <Table.Td style={{ borderColor: '#1f2b3b' }}>{enemy.status}</Table.Td>
    </Table.Tr>
  ));

  return (
    <MainArea title={t('enemies.title')}>
      <GameCard title={t('enemies.enemiesList')}>
        <StyledTable headers={[t('enemies.playerId'), t('enemies.status')]}>
          {rows}
        </StyledTable>
      </GameCard>
    </MainArea>
  );
};

export default Enemies;
