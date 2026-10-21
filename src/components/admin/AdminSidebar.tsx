import {
  faBars,
  faChevronDown,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Accordion,
  Drawer,
  NavLink,
  ScrollArea,
  Text,
  UnstyledButton,
} from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useEffect, useMemo, useState } from 'react';

import { useUser } from '@/context/users';
import { PermissionType } from '@/lib/prisma-browser-exports';

import {
  adminNavCategories,
  type AdminNavCategory,
  type AdminNavItem,
} from './adminNavConfig';
import classes from './AdminSidebar.module.css';

/** Returns the nav categories the current user may see, with items filtered. */
function useVisibleCategories(): AdminNavCategory[] {
  const { user } = useUser();

  return useMemo(() => {
    const userPerms = new Set<PermissionType>(
      user?.permissions?.map((p) => p.type as PermissionType) ?? [],
    );
    const isAdministrator = (user?.staffRoles ?? []).includes('ADMINISTRATOR');

    return adminNavCategories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            (!item.permissions ||
              item.permissions.some((p) => userPerms.has(p))) &&
            (!item.administratorOnly || isAdministrator),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [user?.permissions, user?.staffRoles]);
}

/** Resolves translated labels for nav items and categories. */
function useNavLabels() {
  const { t } = useTranslation('navigation');
  const { t: tUsers } = useTranslation('admin-users');

  return {
    itemLabel: (item: AdminNavItem) =>
      item.labelKey.startsWith('admin-users:')
        ? tUsers(item.labelKey.replace('admin-users:', ''))
        : t(item.labelKey.replace('navigation.', '')),
    categoryLabel: (cat: AdminNavCategory) =>
      t(cat.labelKey.replace('navigation.', '')),
  };
}

function currentPath(asPath: string): string {
  return asPath.split('?')[0].split('#')[0];
}

/** Finds the item for the current page, falling back to the closest parent route. */
function findActive(
  categories: AdminNavCategory[],
  asPath: string,
): { category: AdminNavCategory; item: AdminNavItem } | null {
  const path = currentPath(asPath);
  let best: { category: AdminNavCategory; item: AdminNavItem } | null = null;
  let bestLength = -1;

  for (const category of categories) {
    for (const item of category.items) {
      const exact = path === item.href;
      const parent =
        item.href !== '/home/admin' && path.startsWith(`${item.href}/`);
      if (exact) return { category, item };
      if (parent && item.href.length > bestLength) {
        best = { category, item };
        bestLength = item.href.length;
      }
    }
  }
  return best;
}

interface AdminNavListProps {
  onNavigate?: () => void;
}

/** Collapsible category groups; the group holding the current page opens itself. */
const AdminNavList = ({ onNavigate }: AdminNavListProps) => {
  const router = useRouter();
  const categories = useVisibleCategories();
  const { itemLabel, categoryLabel } = useNavLabels();
  const active = findActive(categories, router.asPath);
  const activeCategoryKey = active?.category.key;
  const [openGroups, setOpenGroups] = useState<string[]>(
    activeCategoryKey ? [activeCategoryKey] : [],
  );

  useEffect(() => {
    if (!activeCategoryKey) return;
    setOpenGroups((prev) =>
      prev.includes(activeCategoryKey) ? prev : [...prev, activeCategoryKey],
    );
  }, [activeCategoryKey]);

  const renderLink = (item: AdminNavItem) => {
    const isCurrent = active?.item.key === item.key;
    return (
      <NavLink
        key={item.key}
        component={Link}
        href={item.href}
        label={itemLabel(item)}
        leftSection={
          <FontAwesomeIcon
            icon={item.icon}
            className={classes.icon}
            aria-hidden="true"
          />
        }
        active={isCurrent}
        data-active={isCurrent || undefined}
        aria-current={isCurrent ? 'page' : undefined}
        className={classes.link}
        onClick={onNavigate}
        styles={{ label: { fontSize: '0.9rem', fontWeight: 'inherit' } }}
      />
    );
  };

  const toggleGroup = (key: string, isOpen: boolean) =>
    setOpenGroups((prev) =>
      isOpen
        ? prev.includes(key)
          ? prev
          : [...prev, key]
        : prev.filter((k) => k !== key),
    );

  return (
    <>
      {categories.map((cat) => {
        if (cat.items.length === 1) {
          return <div key={cat.key}>{renderLink(cat.items[0])}</div>;
        }
        return (
          <Accordion
            key={cat.key}
            variant="unstyled"
            value={openGroups.includes(cat.key) ? cat.key : null}
            onChange={(value) => toggleGroup(cat.key, value === cat.key)}
            chevron={<FontAwesomeIcon icon={faChevronDown} size="xs" />}
            styles={{
              item: { border: 0 },
              control: { padding: '8px 10px', minHeight: 40 },
              label: { padding: 0 },
              icon: { marginRight: 10 },
              content: { padding: '0 0 4px 8px' },
            }}
          >
            <Accordion.Item
              value={cat.key}
              className={
                active?.category.key === cat.key ? classes.groupHasActive : ''
              }
            >
              <Accordion.Control
                className={classes.groupControl}
                icon={
                  <FontAwesomeIcon
                    icon={cat.icon}
                    className={classes.icon}
                    aria-hidden="true"
                  />
                }
              >
                <span className={classes.groupLabel}>{categoryLabel(cat)}</span>
              </Accordion.Control>
              <Accordion.Panel className={classes.groupContent}>
                {cat.items.map(renderLink)}
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        );
      })}
    </>
  );
};

/** Desktop sidebar: always-visible, sticky navigation. */
const AdminSidebar = () => {
  const { t: tCommon } = useTranslation('common');

  return (
    <nav
      aria-label={tCommon('interface.adminNavigation')}
      data-testid="admin-sidebar"
    >
      <AdminNavList />
    </nav>
  );
};

/** Mobile navigation: a sticky "where am I" bar that opens a full nav drawer. */
export const AdminMobileNav = () => {
  const router = useRouter();
  const { t: tCommon } = useTranslation('common');
  const categories = useVisibleCategories();
  const { itemLabel, categoryLabel } = useNavLabels();
  const [opened, setOpened] = useState(false);
  const active = findActive(categories, router.asPath);

  useEffect(() => {
    const close = () => setOpened(false);
    router.events.on('routeChangeComplete', close);
    return () => router.events.off('routeChangeComplete', close);
  }, [router.events]);

  return (
    <div className={classes.mobileBar} data-testid="admin-mobile-nav">
      <UnstyledButton
        className={classes.mobileTrigger}
        onClick={() => setOpened(true)}
        aria-haspopup="dialog"
        aria-expanded={opened}
        aria-label={tCommon('interface.adminNavigation')}
      >
        <FontAwesomeIcon icon={faBars} aria-hidden="true" />
        <span style={{ flex: 1, minWidth: 0 }}>
          {active && (
            <Text
              size="xs"
              c="dimmed"
              tt="uppercase"
              fw={700}
              lh={1.2}
              truncate
            >
              {categoryLabel(active.category)}
            </Text>
          )}
          <Text fw={600} lh={1.3} truncate>
            {active
              ? itemLabel(active.item)
              : tCommon('interface.adminNavigation')}
          </Text>
        </span>
        <FontAwesomeIcon icon={faChevronDown} size="xs" aria-hidden="true" />
      </UnstyledButton>

      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="left"
        size="min(320px, 88vw)"
        title={tCommon('interface.adminNavigation')}
        closeButtonProps={{
          icon: <FontAwesomeIcon icon={faXmark} />,
          'aria-label': tCommon('buttons.close'),
          size: 'lg',
        }}
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <nav
          aria-label={tCommon('interface.adminNavigation')}
          data-testid="admin-mobile-nav-list"
        >
          <AdminNavList onNavigate={() => setOpened(false)} />
        </nav>
      </Drawer>
    </div>
  );
};

export default AdminSidebar;
