import {
  Badge,
  Button,
  Group,
  Pagination,
  Skeleton,
  Table,
  Text,
} from '@mantine/core';
import React from 'react';

import { StyledTable } from './game/StyledTable';

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
  onImpersonateUser: (userId: string) => void;
  isLoading: boolean;
  isImpersonating: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (field: string) => void;
}

const UserList: React.FC<UserListProps> = ({
  users,
  onEditUser,
  onImpersonateUser,
  isLoading,
  isImpersonating,
  page,
  totalPages,
  onPageChange,
  sortBy: _sortBy,
  sortOrder: _sortOrder,
  onSortChange: _onSortChange,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'green';
      case 'VACATION':
        return 'blue';
      case 'IDLE':
        return 'orange';
      case 'INACTIVE':
        return 'gray';
      case 'SUSPENDED':
        return 'yellow';
      case 'BANNED':
        return 'red';
      case 'CLOSED':
        return 'gray';
      default:
        return 'gray';
    }
  };

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  const headers = [
    'ID',
    'Username',
    'Email',
    'Status',
    'Last Active',
    'Actions',
  ];

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
          <Button
            size="xs"
            variant="light"
            color="violet"
            disabled={isImpersonating}
            onClick={() => onImpersonateUser(user.id)}
          >
            Impersonate
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  if (isLoading) {
    return <Skeleton height={200} />;
  }

  if (users.length === 0) {
    return <Text>No users found.</Text>;
  }

  return (
    <>
      <StyledTable headers={headers}>{rows}</StyledTable>
      <Group justify="center" mt="md">
        <Pagination value={page} onChange={onPageChange} total={totalPages} />
      </Group>
    </>
  );
};

export default UserList;
