import { Container, Space, Title } from '@mantine/core';
import { PermissionType } from '@prisma/client';
import { forwardRef, type ReactNode } from 'react';

import { useUser } from '@/context/users';

import AdminSidebar from './AdminSidebar';

interface AdminLayoutProps {
  title: string;
  children: ReactNode;
  permission?: PermissionType;
  permissions?: PermissionType[];
  requireAll?: boolean;
}

const AdminLayout = forwardRef<HTMLDivElement, AdminLayoutProps>(
  function AdminLayout(
    { title, children, permission, permissions, requireAll = false },
    ref,
  ) {
    const { user } = useUser();

    const userPerms =
      user?.permissions?.map((p) => p.type as PermissionType) ?? [];

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

    if (!hasAccess) {
      return (
        <div className="flex w-full flex-col overflow-y-auto pb-10" ref={ref}>
          <Title
            order={2}
            className="bg-orange-gradient text-shadow text-shadow-xs text-gradient-orange"
            p="md"
          >
            Permission Denied
          </Title>
          <Container p="md">
            <p>You do not have sufficient permissions to access this page.</p>
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
          style={{
            height: 56,
            borderBottom:
              '1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))',
            flexShrink: 0,
          }}
        >
          <Container
            fluid
            style={{
              height: 56,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 16,
              paddingRight: 16,
            }}
          >
            <Title
              order={2}
              className="bg-orange-gradient text-shadow text-shadow-xs text-gradient-orange"
              data-testid="page-title"
            >
              {title}
            </Title>
          </Container>
        </header>

        <div className="flex flex-1 flex-col lg:flex-row">
          <aside
            className="w-full shrink-0 border-b border-[var(--ot-border)] lg:w-[220px] lg:border-b-0 lg:border-r"
            style={{
              backgroundColor:
                'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))',
            }}
          >
            <div className="p-2">
              <AdminSidebar />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <Space h="md" />
            <div className="px-4">{children}</div>
          </div>
        </div>
      </div>
    );
  },
);

export default AdminLayout;
