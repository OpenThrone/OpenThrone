import React, { useState, useEffect } from 'react';
import { Button, Table, Loader, Group } from '@mantine/core';
import { useUser } from '@/context/users';
import MainArea from '@/components/MainArea';
import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import { logError } from '@/utils/logger';

const Requests = (props) => {
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
        logError("Error fetching requests:", error);
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
        // Update the local state to reflect the change
        setRequests(currentRequests => currentRequests.filter(request => request.id !== id));
      })
      .catch(error => {
        logError("Error responding to request:", error);
      });
  };

  if (loading) {
    return (
      <MainArea title="Friend Requests">
        <GameCard title="Friend Requests">
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
          <Table.Td colSpan={4} style={{ borderColor: '#1f2b3b' }}>No requests</Table.Td>
        </Table.Tr>
      );
    }

    return requestsList.map(request => (
      <Table.Tr key={request.id} style={{ background: '#0f141a' }}>
        <Table.Td style={{ borderColor: '#1f2b3b' }}>
          {request.friend && request.friend.display_name ? request.friend.display_name : "Unknown Player"} {/* Safe access */}
        </Table.Td>
        <Table.Td style={{ borderColor: '#1f2b3b' }}>{new Date(request.requestDate).toLocaleString()}</Table.Td>
        <Table.Td style={{ borderColor: '#1f2b3b' }}>{request.status}</Table.Td>
        <Table.Td style={{ borderColor: '#1f2b3b' }}>
          {request.type === 'outgoing' ? 'Pending acceptance' : (
            <Group>
              <Button size="xs" color="yellow" onClick={() => handleResponse(request.id, 'accept')}>Accept</Button>
              <Button size="xs" color="red" onClick={() => handleResponse(request.id, 'decline')}>Decline</Button>
            </Group>
          )}
        </Table.Td>
      </Table.Tr>
    ));
  };

  return (
    <MainArea title="Friend Requests">
      <GameCard title="Incoming Requests">
        <StyledTable headers={['Player', 'Date/Time', 'Status', 'Actions']}>
          {renderRows(incomingRequests)}
        </StyledTable>
      </GameCard>

      <GameCard title="Outgoing Requests" mt="md">
        <StyledTable headers={['Player', 'Date/Time', 'Status', 'Actions']}>
          {renderRows(outgoingRequests)}
        </StyledTable>
      </GameCard>
    </MainArea>
  );
};

export default Requests;
