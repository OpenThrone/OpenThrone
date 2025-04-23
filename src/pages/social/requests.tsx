import React, { useState, useEffect } from 'react';
import { Button, Table, Loader, Group, Paper, Title } from '@mantine/core';
import { useUser } from '@/context/users';
import MainArea from '@/components/MainArea';

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

  if (loading) return <Loader />;

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
        <Table.Tr>
          <Table.Td colSpan={4}>No requests</Table.Td>
        </Table.Tr>
      );
    }

    return requestsList.map(request => (
      <Table.Tr key={request.id}>
        <Table.Td>
          {request.friend && request.friend.display_name ? request.friend.display_name : "Unknown Player"} {/* Safe access */}
        </Table.Td>
        <Table.Td>{new Date(request.requestDate).toLocaleString()}</Table.Td>
        <Table.Td>{request.status}</Table.Td>
        <Table.Td>
          {request.type === 'outgoing' ? 'Pending acceptance' : (
            <Group>
              <Button size="xs" color="green" onClick={() => handleResponse(request.id, 'accept')}>Accept</Button>
              <Button size="xs" color="red" onClick={() => handleResponse(request.id, 'decline')}>Decline</Button>
            </Group>
          )}
        </Table.Td>
      </Table.Tr>
    ));
  };

  return (
    <MainArea title="Friend Requests">
      <Paper shadow="xs" p="md">
        <Table className="min-w-full border-neutral-500" striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Player</Table.Th>
              <Table.Th>Date/Time</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{renderRows(incomingRequests)}</Table.Tbody>
        </Table>
      </Paper>

      <Title order={2} className="text-gradient-orange bg-orange-gradient text-shadow text-shadow-xs pl-5">
        Outgoing Friend Requests
      </Title>
      <Paper shadow="xs" p="md">
        <Table className="min-w-full border-neutral-500" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Player ID</Table.Th>
              <Table.Th>Date/Time</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{renderRows(outgoingRequests)}</Table.Tbody>
        </Table>
      </Paper>
    </MainArea>
  );
};

export default Requests;
