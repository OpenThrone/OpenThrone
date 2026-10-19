import { faUserPlus, faUsersCog } from '@fortawesome/free-solid-svg-icons';
import { Alert, Button, Grid, Group, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { GetServerSideProps } from 'next';
import { signIn, useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import GrantUserForm from '@/components/GrantUserForm';
import UserAdminEditor from '@/components/UserAdminEditor';
import UserList from '@/components/UserList';
import UserSearchFilter from '@/components/UserSearchFilter';
import { useUser } from '@/context/users';
import { endImpersonation } from '@/hooks/useImpersonation';
import { PermissionType } from '@/lib/prisma-browser-exports';
import { logError } from '@/utils/logger';

interface UserSummary {
  id: string;
  username: string;
  email: string;
  status: string;
  lastActive?: Date | string;
  permissions?: string[];
  staffRoles?: string[];
}

const PAGE_SIZE = 10;

const AdminUsersPage = () => {
  const { t } = useTranslation('admin-users');
  const { data: session } = useSession();
  const { user, loading: userLoading } = useUser();
  const isAdministrator = useMemo(
    () => (user?.staffRoles ?? []).includes('ADMINISTRATOR'),
    [user?.staffRoles],
  );
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isImpersonationLoading, setIsImpersonationLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const handleSearch = useCallback(
    async (nextFilters: Record<string, string> = filters) => {
      setIsLoading(true);
      setLoadError(null);
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
        sort: sortBy,
        order: sortOrder,
        ...nextFilters,
      });
      try {
        const response = await fetch(`/api/admin/users?${params.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || t('errors.list'));
        const nextUsers = Array.isArray(payload.users) ? payload.users : [];
        setUsers(nextUsers);
        setTotalPages(
          Math.max(1, Math.ceil((Number(payload.total) || 0) / PAGE_SIZE)),
        );
      } catch (requestError) {
        logError('Failed to load admin user list', requestError);
        setLoadError(
          requestError instanceof Error
            ? requestError.message
            : t('errors.list'),
        );
        setUsers([]);
      } finally {
        setIsLoading(false);
      }
    },
    [filters, page, sortBy, sortOrder, t],
  );

  useEffect(() => {
    if (
      !userLoading &&
      user?.permissions?.some(
        (permission) => permission.type === PermissionType.MANAGE_USERS,
      )
    )
      handleSearch(filters);
  }, [filters, handleSearch, userLoading, user?.permissions]);

  const submitSearch = (nextFilters: Record<string, string>) => {
    setPage(1);
    setFilters(nextFilters);
  };

  const handleSortChange = (field: string) => {
    setSortOrder(sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc');
    setSortBy(field);
    setPage(1);
  };

  const handleOpenUser = useCallback((userId: string) => {
    setSelectedUserId(userId);
    setEditModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setEditModalOpen(false);
    setSelectedUserId(null);
  }, []);

  const handleImpersonateUser = useCallback(
    async (userId: string) => {
      if (!isAdministrator || isImpersonationLoading) return;
      setIsImpersonationLoading(true);
      try {
        const response = await fetch('/api/admin/impersonate/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: Number(userId) }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(payload.error || t('errors.impersonation'));
        const signInResult = await signIn('credentials', {
          redirect: false,
          impersonateUserId: payload?.target?.id ?? Number(userId),
          impersonationTicket: payload?.signInPayload?.impersonationTicket,
        });
        if (signInResult?.error) throw new Error(signInResult.error);
        window.location.href = '/home/overview';
      } catch (requestError) {
        notifications.show({
          title: t('errors.impersonationTitle'),
          message:
            requestError instanceof Error
              ? requestError.message
              : t('errors.impersonation'),
          color: 'red',
        });
      } finally {
        setIsImpersonationLoading(false);
      }
    },
    [isAdministrator, isImpersonationLoading, t],
  );

  const handleStopImpersonation = useCallback(async () => {
    if (isImpersonationLoading) return;
    setIsImpersonationLoading(true);
    await endImpersonation();
  }, [isImpersonationLoading]);

  const isImpersonating = Boolean(
    (session?.user as { impersonatedBy?: number } | undefined)?.impersonatedBy,
  );

  return (
    <AdminLayout
      title={t('page.title')}
      permissions={[
        PermissionType.MANAGE_USERS,
        PermissionType.VIEW_STAFF_DASHBOARD,
      ]}
    >
      <Grid>
        {isAdministrator && (
          <Grid.Col span={12}>
            <GameCard title={t('sections.grantPermissions')} icon={faUserPlus}>
              <GrantUserForm />
            </GameCard>
          </Grid.Col>
        )}
        <Grid.Col span={12}>
          <GameCard title={t('sections.userManagement')} icon={faUsersCog}>
            <Stack gap="md">
              {isImpersonating && (
                <Group justify="space-between" align="center">
                  <Text c="yellow">{t('messages.impersonating')}</Text>
                  <Button
                    size="xs"
                    variant="outline"
                    color="yellow"
                    loading={isImpersonationLoading}
                    onClick={handleStopImpersonation}
                  >
                    {t('actions.endImpersonation')}
                  </Button>
                </Group>
              )}
              {!userLoading && !isAdministrator && (
                <Alert color="blue">{t('messages.moderatorReadOnly')}</Alert>
              )}
              <UserSearchFilter onSearch={submitSearch} />
              {loadError && (
                <Alert color="red" role="alert" title={t('errors.title')}>
                  <Group justify="space-between">
                    <Text>{loadError}</Text>
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => handleSearch(filters)}
                    >
                      {t('actions.retry')}
                    </Button>
                  </Group>
                </Alert>
              )}
              <UserList
                users={users}
                onEditUser={handleOpenUser}
                onImpersonateUser={handleImpersonateUser}
                isAdministrator={isAdministrator}
                isLoading={isLoading || userLoading}
                isImpersonating={isImpersonating || isImpersonationLoading}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={handleSortChange}
              />
            </Stack>
          </GameCard>
        </Grid.Col>
      </Grid>
      <Modal
        opened={editModalOpen}
        onClose={handleCloseModal}
        size="xl"
        title={t('editor.modalTitle')}
      >
        {selectedUserId && (
          <UserAdminEditor
            userId={selectedUserId}
            isAdministrator={isAdministrator}
            onClose={handleCloseModal}
            onSaved={() => handleSearch(filters)}
          />
        )}
      </Modal>
    </AdminLayout>
  );
};

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-users',
      'admin-operations',
    ])),
  },
});

export default AdminUsersPage;
