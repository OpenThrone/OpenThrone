import { Alert, Container, Loader, Space, Stack, Title } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { forwardRef, type ReactNode } from 'react';

import { useUser } from '@/context/users';
import { PermissionType } from '@/lib/prisma-browser-exports';

import AdminSidebar, { AdminMobileNav } from './AdminSidebar';

interface AdminLayoutProps {
  title: string;
  children: ReactNode;
  permission?: PermissionType;
  permissions?: PermissionType[];
  requireAll?: boolean;
  administratorOnly?: boolean;
}

const AdminLayout = forwardRef<HTMLDivElement, AdminLayoutProps>(
  function AdminLayout(
    {
      title,
      children,
      permission,
      permissions,
      requireAll = false,
      administratorOnly = false,
    },
    ref,
  ) {
    const { user, loading } = useUser();
    const { t } = useTranslation('common');
    const userPerms =
      user?.permissions?.map((p) => p.type as PermissionType) ?? [];
    const isAdministrator = (user?.staffRoles ?? []).includes('ADMINISTRATOR');

    let hasAccess = false;
    if (permission) {
      hasAccess = userPerms.includes(permission);
    } else if (permissions && permissions.length > 0) {
      hasAccess = requireAll
        ? permissions.every((p) => userPerms.includes(p))
        : permissions.some((p) => userPerms.includes(p));
    } else {
      hasAccess = userPerms.length > 0;
    }

    if (administratorOnly && !loading && !isAdministrator) hasAccess = false;

    if (loading) {
      return (
        <div className="flex w-full flex-col overflow-y-auto pb-10" ref={ref}>
          <Container p="md">
            <Stack align="center" py="xl">
              <Loader aria-label={t('interface.loading')} />
            </Stack>
          </Container>
        </div>
      );
    }

    if (!hasAccess) {
      return (
        <div className="flex w-full flex-col overflow-y-auto pb-10" ref={ref}>
          <Container p="md">
            <Alert
              color="red"
              title={t('interface.permissionDenied')}
              role="alert"
            >
              {t('interface.permissionDescription')}
            </Alert>
          </Container>
        </div>
      );
    }

    return (
      <div
        className="flex w-full flex-col overflow-y-auto pb-10"
        ref={ref}
        data-testid="admin-layout"
      >
        <header
          className="main-header-titleBar"
          style={{
            minHeight: 56,
            borderBottom: '1px solid var(--ot-line)',
            flexShrink: 0,
          }}
        >
          <Container
            fluid
            style={{
              minHeight: 56,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 16,
              paddingRight: 16,
            }}
          >
            <Title
              order={1}
              className="main-header-title"
              data-testid="page-title"
            >
              {title}
            </Title>
          </Container>
        </header>

        <div className="flex flex-1 flex-col lg:flex-row">
          <div className="lg:hidden">
            <AdminMobileNav />
          </div>

          <aside
            className="hidden shrink-0 border-[var(--ot-border)] lg:block lg:w-[250px] lg:border-r"
            style={{
              backgroundColor: 'var(--ot-surface-2)',
            }}
          >
            <div className="sticky top-0 max-h-dvh overflow-y-auto p-3">
              <AdminSidebar />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <Space h="md" />
            <div className="min-w-0 px-4 pb-4">{children}</div>
          </div>
        </div>
      </div>
    );
  },
);

export default AdminLayout;
