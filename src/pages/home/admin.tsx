import { faUserPlus, faUsersCog } from '@fortawesome/free-solid-svg-icons';
import { Button, Grid, Group, Modal, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PermissionType } from '@prisma/client';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import GrantUserForm from '@/components/GrantUserForm';
import MainArea from '@/components/MainArea';
import PermissionCheck from '@/components/PermissionCheck';
import UserAdminEditor from '@/components/UserAdminEditor';
import UserList from '@/components/UserList';
import UserSearchFilter from '@/components/UserSearchFilter';

interface UserSummary {
  id: string;
  username: string;
  email: string;
  status: string;
  lastActive?: Date | string;
  permissions?: string[];
}

const Admin = () => {
  const { t } = useTranslation('home');
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImpersonationLoading, setIsImpersonationLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSearch = useCallback(
    async (filters: Record<string, string> = {}) => {
      setIsLoading(true);
      const params = new URLSearchParams({
        limit: '10',
        offset: ((page - 1) * 10).toString(),
        sort: sortBy,
        order: sortOrder,
        ...filters,
      });
      try {
        const response = await fetch(`/api/admin/users?${params.toString()}`);
        const data = await response.json();
        setUsers(data.users || []);
        setTotalPages(Math.ceil((data.total || 0) / 10));
      } catch {
        setUsers([]);
      } finally {
        setIsLoading(false);
      }
    },
    [page, sortBy, sortOrder],
  );

  useEffect(() => {
    handleSearch({});
  }, [handleSearch]);

  const handleSortChange = (field: string) => {
    setSortBy(field);
    setSortOrder(sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc');
    setPage(1);
  };

  const handleEditUser = useCallback((userId: string) => {
    setSelectedUserId(userId);
    setEditModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setEditModalOpen(false);
    setSelectedUserId(null);
  }, []);

  const handleImpersonateUser = useCallback(async (userId: string) => {
    setIsImpersonationLoading(true);
    try {
      const response = await fetch('/api/admin/impersonate/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetUserId: Number(userId) }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to start impersonation');
      }

      const signInResult = await signIn('credentials', {
        redirect: false,
        impersonateUserId: payload?.target?.id ?? Number(userId),
        impersonationTicket: payload?.signInPayload?.impersonationTicket,
      });

      if (signInResult?.error) {
        throw new Error(signInResult.error);
      }

      window.location.href = `/userprofile/${userId}`;
    } catch (error) {
      notifications.show({
        title: 'Impersonation failed',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to start impersonation',
        color: 'red',
      });
    } finally {
      setIsImpersonationLoading(false);
    }
  }, []);

  const handleStopImpersonation = useCallback(async () => {
    setIsImpersonationLoading(true);
    try {
      await fetch('/api/admin/impersonate/stop', {
        method: 'POST',
      });
      await signOut({ callbackUrl: '/account/login' });
    } finally {
      setIsImpersonationLoading(false);
    }
  }, []);

  const isImpersonating = Boolean((session?.user as any)?.impersonatedBy);

  return (
    <PermissionCheck permission={PermissionType.ADMINISTRATOR}>
      <MainArea title={t('admin.title')}>
        <Grid>
          <Grid.Col span={12}>
            <GameCard title={t('admin.grantPermissions')} icon={faUserPlus}>
              <GrantUserForm />
            </GameCard>
          </Grid.Col>
          <Grid.Col span={12}>
            <GameCard title={t('admin.userManagement')} icon={faUsersCog}>
              {isImpersonating && (
                <Group justify="space-between" mb="sm">
                  <Text c="yellow">
                    You are currently in an impersonated session.
                  </Text>
                  <Button
                    size="xs"
                    variant="outline"
                    color="yellow"
                    loading={isImpersonationLoading}
                    onClick={handleStopImpersonation}
                  >
                    End Impersonation
                  </Button>
                </Group>
              )}
              <UserSearchFilter onSearch={handleSearch} />
              <UserList
                users={users}
                onEditUser={handleEditUser}
                onImpersonateUser={handleImpersonateUser}
                isLoading={isLoading}
                isImpersonating={isImpersonating || isImpersonationLoading}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={handleSortChange}
              />
            </GameCard>
          </Grid.Col>
        </Grid>
        <Modal
          opened={editModalOpen}
          onClose={handleCloseModal}
          size="xl"
          title={t('admin.editUser')}
        >
          {selectedUserId && (
            <UserAdminEditor
              userId={selectedUserId}
              onClose={handleCloseModal}
              onSaved={handleSearch}
            />
          )}
        </Modal>
      </MainArea>
    </PermissionCheck>
  );
};

export default Admin;
