import { Loader, Table } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import { logError } from '@/utils/logger';

const Requests = () => {
  const { t } = useTranslation('social');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = useUser();

  useEffect(() => {
    fetch('/api/social/listAll?type=REQUESTS')
      .then((response) => response.json())
      .then((data) => {
        setRequests(data);
        setLoading(false);
      })
      .catch((error) => {
        logError(t('requests.errorFetchingRequests'), error);
        setLoading(true);
      });
  }, []);

  if (loading) {
    return (
      <MainArea title={t('requests.title')}>
        <GameCard title={t('requests.title')}>
          <Loader />
        </GameCard>
      </MainArea>
    );
  }

  const processedRequests = requests.map((request) => ({
    ...request,
    type: request.playerId === user.id ? 'outgoing' : 'incoming',
  }));

  const outgoingRequests = processedRequests.filter(
    (request) => request.type === 'outgoing',
  );
  const incomingRequests = processedRequests.filter(
    (request) => request.type === 'incoming',
  );

  const renderRows = (requestsList) => {
    if (requestsList.length === 0) {
      return (
        <Table.Tr style={{ background: '#0f141a' }}>
          <Table.Td colSpan={4} style={{ borderColor: '#1f2b3b' }}>
            {t('requests.noRequestsFound')}
          </Table.Td>
        </Table.Tr>
      );
    }
  };

  return (
    <MainArea title={t('requests.title')}>
      <GameCard title={t('requests.incomingRequests')}>
        <StyledTable
          headers={[
            t('requests.player'),
            t('requests.dateTime'),
            t('requests.status'),
            t('requests.actions'),
          ]}
        >
          {renderRows(incomingRequests)}
        </StyledTable>
      </GameCard>

      <GameCard title={t('requests.outgoingRequests')} mt="md">
        <StyledTable
          headers={[
            t('requests.player'),
            t('requests.dateTime'),
            t('requests.status'),
            t('requests.actions'),
          ]}
        >
          {renderRows(outgoingRequests)}
        </StyledTable>
      </GameCard>
    </MainArea>
  );
};

export default Requests;
