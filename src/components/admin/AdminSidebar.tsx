import { Anchor, NavLink, ScrollArea, Text } from '@mantine/core';
import { PermissionType } from '@prisma/client';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';

import { useUser } from '@/context/users';

import { adminNavCategories, type AdminNavItem } from './adminNavConfig';

const AdminSidebar = () => {
  const router = useRouter();
  const { t } = useTranslation('navigation');
  const { user } = useUser();

  const userPerms = useMemo(
    () =>
      new Set<PermissionType>(
        user?.permissions?.map((p) => p.type as PermissionType) ?? [],
      ),
    [user?.permissions],
  );

  const visibleCategories = useMemo(() => {
    if (userPerms.size === 0) return [];
    return adminNavCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            !item.permissions || item.permissions.some((p) => userPerms.has(p)),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [userPerms]);

  return (
    <nav aria-label="Admin navigation" data-testid="admin-sidebar">
      <ScrollArea.Autosize mah="calc(100vh - 180px)" type="auto">
        {visibleCategories.map((cat) => (
          <div key={cat.key}>
            <Text
              size="xs"
              fw={700}
              tt="uppercase"
              c="dimmed"
              pl="md"
              pt="sm"
              pb={4}
            >
              {t(cat.labelKey.replace('navigation.', ''))}
            </Text>
            {cat.items.map((item) => (
              <Anchor
                key={item.key}
                component={Link}
                href={item.href}
                underline="never"
              >
                <NavLink
                  label={t(item.labelKey.replace('navigation.', ''))}
                  active={isActive(router.asPath, item)}
                  variant="light"
                  style={{
                    borderRadius: 6,
                  }}
                  styles={{
                    root: {
                      marginTop: 2,
                      marginBottom: 2,
                    },
                    body: {
                      borderRadius: 6,
                    },
                    label: {
                      fontSize: '0.85rem',
                    },
                  }}
                />
              </Anchor>
            ))}
          </div>
        ))}
      </ScrollArea.Autosize>
    </nav>
  );
};

function isActive(asPath: string, item: AdminNavItem): boolean {
  const path = asPath.split('?')[0];
  return path === item.href;
}

export default AdminSidebar;
