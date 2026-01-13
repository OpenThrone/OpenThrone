import React, { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import { getSafeLocale } from '@/utils/i18n';

import { Button, Table, Loader, Group } from '@mantine/core';
import { useUser } from '@/context/users';
import MainArea from '@/components/MainArea';
import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import { logError } from '@/utils/logger';
import { InferGetServerSidePropsType } from "next";

const Requests = (props: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { t } = useTranslation('social');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  useEffect(() => {
    fetch('/api/social/listAll?type=REQUESTS')
      .then(response => response.json())
      .then(data => {
        setRequests(data);
        setLoading(false);
      }).catch(error => {
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
    console.log(requestsList);
    if (requestsList.length === 0) {
      return (
        <Table.Tr style={{ background: '#0f141a' }}>
          <Table.Td colSpan={4} style={{ borderColor: '#1f2b3b' }}>{t('requests.noRequestsFound')}</Table.Td>
        </Table.Tr>
      );
    }

    return requestsList.map(request => (
      <Table.Tr key={request.id} style={{ background: '#0f141a' }}>
        <Table.Td style={{ borderColor: '#1f2b3b' }}>
          {request.friend && request.friend.display_name ? request.friend.display_name : t('requests.unknownPlayer')} {/* Safe access */}
        </Table.Td>
        <Table.Td style={{ borderColor: '#1f2b3b' }}>{new Date(request.requestDate).toLocaleString()}</Table.Td>
        <Table.Td style={{ borderColor: '#1f2b3b' }}>{request.status}</Table.Td>
        <Table.Td style={{ borderColor: '#1f2b3b' }}>
          {request.type === 'outgoing' ? t('requests.pendingAcceptance') : (
            <Group>
              <Button size="xs" color="yellow" onClick={() => handleResponse(request.id, 'accept')}>{t('requests.accept')}</Button>
              <Button size="xs" color="red" onClick={() => handleResponse(request.id, 'decline')}>{t('requests.decline')}</Button>
            </Group>
          )}
        </Table.Td>
      </Table.Tr>
    ));
  };

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

export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(getSafeLocale(context), ['social'])),
    },
  };
};

export default Requests;
