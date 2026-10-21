import { Alert, Container, Loader, Stack, Title } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { forwardRef, type ReactNode } from 'react';

import { useUser } from '@/context/users';
import { PermissionType } from '@/lib/prisma-browser-exports';

import classes from './AdminLayout.module.css';
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
        <div className={classes.root} ref={ref}>
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
        <div className={classes.root} ref={ref}>
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
      <div className={classes.root} ref={ref} data-testid="admin-layout">
        <header className={`main-header-titleBar ${classes.header}`}>
          <Container fluid className={classes.headerInner}>
            <Title
              order={1}
              className="main-header-title"
              data-testid="page-title"
            >
              {title}
            </Title>
          </Container>
        </header>

        <div className={classes.body}>
          <div className={classes.mobileNav}>
            <AdminMobileNav />
          </div>

          <aside className={classes.sidebar}>
            <div className={classes.sidebarInner}>
              <AdminSidebar />
            </div>
          </aside>

          <div className={classes.content}>{children}</div>
        </div>
      </div>
    );
  },
);

export default AdminLayout;
