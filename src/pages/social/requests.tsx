import React, { useState, useEffect } from 'react';
import { Button, Table, Loader, Group, Paper } from '@mantine/core';
import { useUser } from '@/context/users';

const Requests = (props) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  useEffect(() => {
    fetch(process.env.NEXTAUTH_URL + '/api/social/listAll?type=REQUESTS')
      .then(response => response.json())
      .then(data => {
        setRequests(data);
        setLoading(false);
      });
  }, []);

  const handleResponse = (id, action) => {
    fetch('https://openthrone.dev/api/social/respond', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, requestId: id }),
    })
      .then(response => response.json())
      .then(() => {
        // Update the local state to reflect the change
        setRequests(currentRequests => currentRequests.filter(request => request.id !== id));
      });
  };

  if (loading) return <Loader />;

  const outgoingRequests = JSON.parse(JSON.stringify(requests)).filter(request => request.playerId === user.id).map(request => {
    return {
      ...request,
      type: 'outgoing'
    };
  });
  const incomingRequests = JSON.parse(JSON.stringify(requests)).filter(request => request.friendId === user.id).map(request => {
    return {
      ...request,
      type: 'incoming'
    };
  });

  const renderRows = (requestsList) => {
    if (requestsList.length === 0) {
      return (
        <Table.Tr>
          <Table.Td colSpan={4}>No requests</Table.Td>
        </Table.Tr>
      );
    }
    console.log('request: ', requestsList);
    return requestsList.map(request => (
      <Table.Tr key={request.id}>
        <Table.Td>{request.type === 'incoming' ? request.friend.display_name : request.friend.display_name}</Table.Td>
        <Table.Td>{new Date(request.requestDate).toLocaleString()}</Table.Td>
        <Table.Td>{request.status}</Table.Td>
        <Table.Td>
          {request.type === 'outgoing' ? 'Pending acceptance' : (
            <Group>
              <Button size="xs" color="green" onClick={() => handleResponse(request.id, 'accept')}>Accept</Button>
              <Button size="xs" color="red" onClick={() => handleResponse(request.id, 'decline')}>Decline</Button>
            </Group>
          )
          }
        </Table.Td>
      </Table.Tr>
    ));
  }

  return (
    <div className="mainArea pb-10">
      <h2 className='page-title'>Outgoing Friend Requests</h2>
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
          <Table.Tbody>{renderRows(outgoingRequests)}</Table.Tbody>
        </Table>
      </Paper>

      <h2 className='page-title'>Incoming Friend Requests</h2>
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
          <Table.Tbody>{renderRows(incomingRequests)}</Table.Tbody>
        </Table>
      </Paper>
    </div>
  );
};

export default Requests;
