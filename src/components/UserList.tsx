import {
  Badge,
  Button,
  Group,
  Pagination,
  Skeleton,
  Table,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { StyledTable } from './game/StyledTable';

interface UserSummary {
  id: string;
  username: string;
  email: string;
  status: string;
  lastActive?: Date | string;
  permissions?: string[];
  staffRoles?: string[];
}

interface UserListProps {
  users: UserSummary[];
  onEditUser: (userId: string) => void;
  onImpersonateUser: (userId: string) => void;
  isAdministrator: boolean;
  isLoading: boolean;
  isImpersonating: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (field: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green',
  VACATION: 'blue',
  IDLE: 'orange',
  INACTIVE: 'gray',
  SUSPENDED: 'yellow',
  BANNED: 'red',
  CLOSED: 'gray',
};

const UserList: React.FC<UserListProps> = ({
  users,
  onEditUser,
  onImpersonateUser,
  isAdministrator,
  isLoading,
  isImpersonating,
  page,
  totalPages,
  onPageChange,
  sortBy,
  sortOrder,
  onSortChange,
}) => {
  const { t } = useTranslation('admin-users');
  const formatDate = (date: Date | string | undefined) => {
    if (!date) return t('fields.unknown');
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime())
      ? t('fields.unknown')
      : new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(parsed);
  };

  if (isLoading)
    return <Skeleton height={200} aria-label={t('states.loading')} />;
  if (users.length === 0) return <Text c="dimmed">{t('states.noUsers')}</Text>;

  const sortableHeader = (field: string, label: string) => (
    <Table.Th key={field}>
      <Button
        variant="subtle"
        size="compact-sm"
        onClick={() => onSortChange(field)}
        aria-label={t('actions.sortBy', { field: label })}
      >
        {label}
        {sortBy === field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
      </Button>
    </Table.Th>
  );
  const rows = users.map((user) => (
    <Table.Tr key={user.id}>
      <Table.Td>{user.id}</Table.Td>
      <Table.Td style={{ overflowWrap: 'anywhere' }}>{user.username}</Table.Td>
      <Table.Td style={{ overflowWrap: 'anywhere' }}>
        {user.email || t('fields.unknown')}
      </Table.Td>
      <Table.Td>
        <Badge color={STATUS_COLORS[user.status] ?? 'gray'}>
          {user.status || t('fields.unknown')}
        </Badge>
      </Table.Td>
      <Table.Td>{formatDate(user.lastActive)}</Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="wrap">
          <Button size="xs" onClick={() => onEditUser(user.id)}>
            {isAdministrator ? t('actions.edit') : t('actions.inspect')}
          </Button>
          {isAdministrator && (
            <Button
              size="xs"
              variant="light"
              color="violet"
              disabled={isImpersonating}
              onClick={() => onImpersonateUser(user.id)}
            >
              {t('actions.impersonate')}
            </Button>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <StyledTable
        headers={[
          sortableHeader('id', t('columns.id')),
          sortableHeader('username', t('columns.username')),
          sortableHeader('email', t('columns.email')),
          <Table.Th key="status">{t('columns.status')}</Table.Th>,
          sortableHeader('lastActive', t('columns.lastActive')),
          <Table.Th key="actions">{t('columns.actions')}</Table.Th>,
        ]}
      >
        {rows}
      </StyledTable>
      {totalPages > 1 && (
        <Group justify="center" mt="md">
          <Pagination
            value={page}
            onChange={onPageChange}
            total={totalPages}
            aria-label={t('pagination.label')}
          />
        </Group>
      )}
    </>
  );
};

export default UserList;
