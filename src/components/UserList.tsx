import React from 'react';
import { Table, Button, Box, Text, Badge, Group, Pagination, UnstyledButton, Skeleton } from '@mantine/core';

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
  isLoading,
  page,
  totalPages,
  onPageChange,
  sortBy,
  sortOrder,
  onSortChange,
}) => {
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

  const renderSortLabel = (field: string, label: string) => (
    <UnstyledButton
      onClick={() => onSortChange(field)}
      style={{ fontWeight: sortBy === field ? 'bold' : undefined }}
    >
      {label}
      {sortBy === field ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
    </UnstyledButton>
  );

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
        <Box>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th><Skeleton height={12} width="5%" radius="sm" /></Table.Th>
                <Table.Th><Skeleton height={12} width="15%" radius="sm" /></Table.Th>
                <Table.Th><Skeleton height={12} width="25%" radius="sm" /></Table.Th>
                <Table.Th><Skeleton height={12} width="10%" radius="sm" /></Table.Th>
                <Table.Th><Skeleton height={12} width="20%" radius="sm" /></Table.Th>
                <Table.Th><Skeleton height={12} width="10%" radius="sm" /></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {Array.from({ length: 10 }).map((_, index) => ( // Show 10 skeleton rows
                <Table.Tr key={index}>
                  <Table.Td><Skeleton height={8} radius="sm" /></Table.Td>
                  <Table.Td><Skeleton height={8} radius="sm" /></Table.Td>
                  <Table.Td><Skeleton height={8} radius="sm" /></Table.Td>
                  <Table.Td><Skeleton height={8} radius="sm" /></Table.Td>
                  <Table.Td><Skeleton height={8} radius="sm" /></Table.Td>
                  <Table.Td><Skeleton height={8} width="70%" radius="sm" /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="center" mt="md">
            <Skeleton height={36} width={200} radius="sm" />
          </Group>
        </Box>
      ) : users.length === 0 ? (
        <Text>No users found matching your search criteria.</Text>
      ) : (
        <>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{renderSortLabel('id', 'ID')}</Table.Th>
                <Table.Th>{renderSortLabel('username', 'Username')}</Table.Th>
                <Table.Th>{renderSortLabel('email', 'Email')}</Table.Th>
                <Table.Th>{renderSortLabel('status', 'Status')}</Table.Th>
                <Table.Th>{renderSortLabel('lastActive', 'Last Active')}</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{rows}</Table.Tbody>
          </Table>
          <Group justify="center" mt="md">
            <Pagination value={page} onChange={onPageChange} total={totalPages} />
          </Group>
        </>
      )}
    </Box>
  );
};

export default UserList;