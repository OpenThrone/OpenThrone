import React from 'react';
import { Table, Button, Box, Text, Badge, Group } from '@mantine/core';

// Update the UserSummary interface to match what we're using
interface UserSummary {
  id: string;
  username: string;
  email: string;
  status: string;
  lastActive?: Date | string;
  permissions?: string[];
}

interface UserListProps {
  users: UserSummary[];
  onEditUser: (userId: string) => void;
  isLoading: boolean;
}

const UserList: React.FC<UserListProps> = ({ users, onEditUser, isLoading }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'green';
      case 'VACATION': return 'blue';
      case 'SUSPENDED': return 'yellow';
      case 'BANNED': return 'red';
      case 'CLOSED': return 'gray';
      default: return 'gray';
    }
  };
  
  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  const rows = users.map((user) => (
    <Table.Tr key={user.id}>
      <Table.Td>{user.id}</Table.Td>
      <Table.Td>{user.username}</Table.Td>
      <Table.Td>{user.email || 'N/A'}</Table.Td>
      <Table.Td>
        <Badge color={getStatusColor(user.status)}>
          {user.status || 'N/A'}
        </Badge>
      </Table.Td>
      <Table.Td>{formatDate(user.lastActive)}</Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Button size="xs" onClick={() => onEditUser(user.id)}>
            Edit
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Box>
      {isLoading ? (
        <Text>Loading users...</Text>
      ) : users.length === 0 ? (
        <Text>No users found matching your search criteria.</Text>
      ) : (
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Username</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Last Active</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      )}
    </Box>
  );
};

export default UserList;