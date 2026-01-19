import React, { useEffect, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Group,
  Indicator,
  Loader,
  Table,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import UserModel from '@/models/Users';
import { alertService } from '@/services/Alert.service';
import { logError } from '@/utils/logger';
import { formatDate } from '@/utils/utilities';

type SocialRequest = {
  id: number;
  playerId: number;
  friendId: number;
  status: string;
  requestDate: string;
  friend?: {
    id: number;
    display_name?: string;
    race?: string;
    class?: string;
    avatar?: string | null;
    last_active?: string | null;
    is_player?: boolean;
  };
};

type RequestAction = 'accept' | 'decline' | 'cancel';

const Requests = () => {
  const { t } = useTranslation('social');
  const [requests, setRequests] = useState<SocialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<{
    id: number;
    action: RequestAction;
  } | null>(null);
  const { user } = useUser();

  useEffect(() => {
    fetch('/api/social/listAll?type=REQUESTS')
      .then((response) => response.json())
      .then((data) => {
        setRequests(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((error) => {
        logError(t('requests.errorFetchingRequests'), error);
        setLoading(false);
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

  const userId = user?.id;
  const processedRequests = requests.map((request) => ({
    ...request,
    type: userId && request.playerId === userId ? 'outgoing' : 'incoming',
  }));

  const outgoingRequests = processedRequests.filter(
    (request) => request.type === 'outgoing',
  );
  const incomingRequests = processedRequests.filter(
    (request) => request.type === 'incoming',
  );

  const removeRequest = (requestId: number) => {
    setRequests((current) => current.filter((request) => request.id !== requestId));
  };

  const handleRespond = async (requestId: number, action: RequestAction) => {
    setActionState({ id: requestId, action });
    try {
      const res = await fetch('/api/social/respond', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('requests.errorRespondingToRequest'));
      }

      alertService.success(
        action === 'accept'
          ? t('requests.requestAccepted')
          : t('requests.requestDeclined'),
      );
      removeRequest(requestId);
    } catch (error) {
      logError(t('requests.errorRespondingToRequest'), error);
      alertService.error(t('requests.errorRespondingToRequest'));
    } finally {
      setActionState(null);
    }
  };

  const handleCancel = async (requestId: number, friendId: number) => {
    setActionState({ id: requestId, action: 'cancel' });
    try {
      const res = await fetch('/api/social/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId, relationshipType: 'FRIEND' }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('requests.errorRespondingToRequest'));
      }

      alertService.success(t('requests.requestCancelled'));
      removeRequest(requestId);
    } catch (error) {
      logError(t('requests.errorRespondingToRequest'), error);
      alertService.error(t('requests.errorRespondingToRequest'));
    } finally {
      setActionState(null);
    }
  };

  const renderRows = (requestsList, requestType: 'incoming' | 'outgoing') => {
    if (requestsList.length === 0) {
      return (
        <Table.Tr style={{ background: '#0f141a' }}>
          <Table.Td colSpan={4} style={{ borderColor: '#1f2b3b' }}>
            {t('requests.noRequestsFound')}
          </Table.Td>
        </Table.Tr>
      );
    }

    return requestsList.map((request) => {
      const player = new UserModel(request.friend, true, false);
      const statusLabel =
        request.status === 'requested'
          ? t('requests.pendingAcceptance')
          : request.status;
      const isLoading = (action: RequestAction) =>
        actionState?.id === request.id && actionState?.action === action;

      return (
        <Table.Tr key={request.id} style={{ background: '#0f141a' }}>
          <Table.Td style={{ borderColor: '#1f2b3b' }}>
            <Group gap="sm" className="text-justify">
              <Indicator color={player.is_online ? 'teal' : 'red'}>
                <Avatar src={player.avatar} size={40} radius={40} />
              </Indicator>
              <div>
                <Text fz="md" fw={500}>
                  {player.displayName || t('requests.unknownPlayer')}
                  {player.is_player && (
                    <Badge color="blue" ml={5}>
                      {t('friends.you')}
                    </Badge>
                  )}
                </Text>
                <Text fz="xs" c="dimmed">
                  {player.race} {player.class}
                </Text>
              </div>
            </Group>
          </Table.Td>
          <Table.Td style={{ borderColor: '#1f2b3b' }}>
            {formatDate(request.requestDate)}
          </Table.Td>
          <Table.Td style={{ borderColor: '#1f2b3b' }}>
            {statusLabel}
          </Table.Td>
          <Table.Td style={{ borderColor: '#1f2b3b' }}>
            {requestType === 'incoming' ? (
              <Group gap="xs">
                <Button
                  size="xs"
                  color="green"
                  loading={isLoading('accept')}
                  onClick={() => handleRespond(request.id, 'accept')}
                >
                  {t('requests.accept')}
                </Button>
                <Button
                  size="xs"
                  color="red"
                  variant="outline"
                  loading={isLoading('decline')}
                  onClick={() => handleRespond(request.id, 'decline')}
                >
                  {t('requests.decline')}
                </Button>
              </Group>
            ) : (
              <Button
                size="xs"
                color="gray"
                variant="outline"
                loading={isLoading('cancel')}
                onClick={() =>
                  handleCancel(request.id, request.friendId || player.id)
                }
              >
                {t('requests.cancel')}
              </Button>
            )}
          </Table.Td>
        </Table.Tr>
      );
    });
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
          {renderRows(incomingRequests, 'incoming')}
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
          {renderRows(outgoingRequests, 'outgoing')}
        </StyledTable>
      </GameCard>
    </MainArea>
  );
};

export default Requests;
