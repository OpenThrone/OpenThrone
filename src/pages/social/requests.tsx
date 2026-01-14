import React, { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';

import { Button, Table, Loader, Group } from '@mantine/core';
import { useUser } from '@/context/users';
import MainArea from '@/components/MainArea';
import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import { logError } from '@/utils/logger';
import { getSafeLocale } from '@/utils/i18n';

const Requests = (props) => {
  const { t } = useTranslation('social');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = useUser();

  useEffect(() => {
    fetch('/api/social/listAll?type=REQUESTS')
      .then(response => response.json())
      .then(data => {
        setRequests(data);
        setLoading(false);
      })
      .catch(error => {
        logError(t('requests.errorFetchingRequests'), error);
        setLoading(true);
      });
  }, []);

  const handleResponse = (id, action) => {
    fetch('/api/social/respond', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, requestId: id }),
    })
      .then(response => response.json())
      .then(() => {
        // Update local state to reflect the change
        setRequests(currentRequests => currentRequests.filter(request => request.id !== id));
      })
      .catch(error => {
        logError(t('requests.errorRespondingToRequest'), error);
      });
  };

  if (loading) {
    return (
      <MainArea title={t('requests.title')}>
        <GameCard title={t('requests.title')}>
          <Loader />
        </GameCard>
      </MainArea>
    );
  }

  const processedRequests = requests.map(request => ({
    ...request,
    type: request.playerId === user.id ? 'outgoing' : 'incoming',
  }));

  const outgoingRequests = processedRequests.filter(request => request.type === 'outgoing');
  const incomingRequests = processedRequests.filter(request => request.type === 'incoming');

  const renderRows = (requestsList) => {
    if (requestsList.length === 0) {
      return (
        <Table.Tr style={{ background: '#0f141a' }}>
          <Table.Td colSpan={4} style={{ borderColor: '#1f2b3b' }}>{t('requests.noRequestsFound')}</Table.Td>
        </Table.Tr>
      );
    }
  }

  return (
    <MainArea title={t('requests.title')}>
      <GameCard title={t('requests.incomingRequests')}>
        <StyledTable headers={[t('requests.player'), t('requests.dateTime'), t('requests.status'), t('requests.actions')]}>
          {renderRows(incomingRequests)}
        </StyledTable>
      </GameCard>

      <GameCard title={t('requests.outgoingRequests')} mt="md">
        <StyledTable headers={[t('requests.player'), t('requests.dateTime'), t('requests.status'), t('requests.actions')]}>
          {renderRows(outgoingRequests)}
        </StyledTable>
      </GameCard>
    </MainArea>
  );
};

export default Requests;
