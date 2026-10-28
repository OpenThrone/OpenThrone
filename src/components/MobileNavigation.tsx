/**
 * Example Usage:
 * ```tsx
 * import { useState } from 'react';
 * import MobileNavigation from './MobileNavigation';
 *
 * const MyComponent = () => {
 *   const [isMenuOpen, setIsMenuOpen] = useState(false);
 *
 *   const menuItems = [
 *     { key: 'home', label: 'Home', href: '/about' },
 *     { key: 'about', label: 'About', href: '/about' },
 *     { key: 'logout', label: 'Logout', onClick: () => console.log('Logout clicked') },
 *   ];
 *
 *   return (
 *     <div>
 *       <UnstyledButton onClick={() => setIsMenuOpen(true)}>Open Menu</UnstyledButton>
 *       <MobileNavigation
 *         open={isMenuOpen}
 *         onClose={() => setIsMenuOpen(false)}
 *         menuItems={menuItems}
 *       />
 *     </div>
 *   );
 * };
 * ```
 */
import {
  faArrowRightFromBracket,
  faChevronDown,
  faComments,
  faGear,
  faIdCard,
  faSkullCrossbones,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Badge, Drawer, Menu, Text, UnstyledButton } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useRef, useState } from 'react';

import ChatNotificationItems from '@/components/game/ChatNotificationItems';
import frameClasses from '@/components/game/FantasyFrame.module.css';
import styles from '@/components/MobileNavigation.module.css';
import { useUser } from '@/context/users';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';

import HeaderIconButton from './HeaderIconButton';
import RpgAwesomeIcon from './RpgAwesomeIcon';

type MenuItem = {
  key: string;
  label: string;
  href?: string;
  onClick?: () => void;
  children?: MenuItem[];
  /** Leading heraldry crest / RPG glyph rendered in the row. */
  icon?: React.ReactNode;
};

type QuickActionsData = {
  unreadMessagesCount: number;
  socialNotificationCount: number;
  onMessagesClick: () => void;
  onSocialClick: () => void;
  onSettingsClick: () => void;
};

const MenuItemComponent: React.FC<{
  item: MenuItem;
  onItemClick: (onClick?: () => void) => void;
  isChild?: boolean;
}> = ({ item, onItemClick, isChild = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const currentPath = router.asPath?.split('?')[0] ?? '/';
  const isActive = currentPath === item.href;
  const isChildActive =
    item.children?.some((child) => currentPath === child.href) ?? false;

  const hasChildren = item.children && item.children.length > 0;

  const shouldUseButton = Boolean(item.onClick) || hasChildren || !item.href;
  const linkClass = isChild
    ? `${styles.subLink} ${isActive ? styles.subLinkActive : ''}`
    : `${styles.link} ${isActive || isChildActive ? styles.linkActive : ''}`;

  const rowContent = (
    <>
      {item.icon && (
        <span
          className={isChild ? styles.subIcon : styles.itemIcon}
          aria-hidden="true"
        >
          {item.icon}
        </span>
      )}
      <span className={isChild ? styles.subLabel : styles.itemLabel}>
        {item.label}
      </span>
      {hasChildren && (
        <FontAwesomeIcon
          icon={faChevronDown}
          size="sm"
          aria-hidden="true"
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
        />
      )}
    </>
  );

  return (
    <li className={isChild ? styles.subItem : styles.linkItem}>
      {shouldUseButton ? (
        <UnstyledButton
          onClick={(e) => {
            if (item.onClick) {
              e.preventDefault();
              onItemClick(item.onClick);
            } else if (hasChildren) {
              e.preventDefault();
              setIsOpen((v) => !v);
            } else {
              onItemClick();
            }
          }}
          className={linkClass}
          aria-expanded={hasChildren ? isOpen : undefined}
        >
          {rowContent}
        </UnstyledButton>
      ) : (
        <Link
          href={item.href}
          onClick={() => onItemClick()}
          className={linkClass}
        >
          {rowContent}
        </Link>
      )}
      {hasChildren && isOpen && (
        <ul className={styles.subList}>
          {item.children?.map((child) => (
            <MenuItemComponent
              key={child.key}
              item={child}
              onItemClick={onItemClick}
              isChild
            />
          ))}
        </ul>
      )}
    </li>
  );
};

type MobileNavigationProps = {
  open: boolean;
  onClose: () => void;
  menuItems: MenuItem[];
  quickActions?: QuickActionsData;
  sidebarContent?: React.ReactNode; // New prop for sidebar content
  className?: string;
};

const MobileNavigation: React.FC<MobileNavigationProps> = ({
  open,
  onClose,
  menuItems,
  sidebarContent, // Destructure new prop
  quickActions,
  className = '',
}) => {
  const { t } = useTranslation('common');
  const { t: tNav } = useTranslation('navigation');
  const { unreadMessages, markRoomAsRead } = useUser();
  const [activeSection, setActiveSection] = useState<'menu' | 'sidebar'>(
    'menu',
  );
  const hasSidebar = Boolean(sidebarContent);
  const reducedMotion = useReducedMotion();
  const touchStartX = useRef<number>(0);
  const { config } = useRuntimeConfig();
  const enableEnemies = config?.enableEnemies === true;
  const enableSocial = config?.enableSocial === true;

  useEffect(() => {
    if (open && hasSidebar) {
      setActiveSection('menu');
    }
  }, [open, hasSidebar]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? 0;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const endX = event.changedTouches[0]?.clientX ?? 0;
    const deltaX = touchStartX.current - endX;
    if (deltaX < -50) {
      onClose();
    }
  };

  const handleItemClick = (itemOnClick?: () => void) => {
    if (itemOnClick) {
      itemOnClick();
    }
    onClose();
  };

  const renderQuickAction = (
    icon: React.ReactNode,
    badgeCount: number | undefined,
    onClick: (() => void) | undefined,
    labelKey: string,
  ) => (
    <HeaderIconButton
      label={t(labelKey)}
      count={badgeCount}
      onClick={onClick}
      size={44}
      radius="sm"
    >
      {icon}
    </HeaderIconButton>
  );

  const handleMessageItemClick = (roomId: number) => {
    markRoomAsRead(roomId);
    onClose();
  };

  const sections: { value: 'menu' | 'sidebar'; label: string }[] = [
    { value: 'menu', label: t('interface.menu') },
    { value: 'sidebar', label: t('interface.kingdom') },
  ];

  return (
    <Drawer
      opened={open}
      onClose={onClose}
      position="right"
      size="min(90vw, 360px)"
      padding={0}
      withCloseButton={false}
      className={className}
      transitionProps={{ duration: reducedMotion ? 0 : 180 }}
      styles={{
        body: {
          flex: 1,
          minHeight: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        },
        content: {
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 0,
        },
      }}
    >
      <nav
        className={`${styles.panel} ${frameClasses.surface} ${frameClasses.ornate}`}
        aria-label={t('ariaLabels.mobileNavigation')}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <header className={styles.drawerHeader}>
          <Text component="h2" className={styles.drawerTitle}>
            {t('interface.menu')}
          </Text>
          <HeaderIconButton
            label={t('ariaLabels.closeNavigationPanel')}
            onClick={onClose}
            size={44}
            radius="sm"
          >
            <FontAwesomeIcon icon={faXmark} size="lg" />
          </HeaderIconButton>
        </header>

        <div className={styles.content}>
          {hasSidebar && (
            <div
              className={styles.tabSwitcher}
              role="tablist"
              aria-label={t('ariaLabels.mobileNavigation')}
              data-testid="mobile-nav-segmented"
            >
              {sections.map((section) => (
                <UnstyledButton
                  key={section.value}
                  role="tab"
                  aria-selected={activeSection === section.value}
                  className={`${styles.tab} ${
                    activeSection === section.value ? styles.tabActive : ''
                  }`}
                  onClick={() => setActiveSection(section.value)}
                >
                  {section.label}
                </UnstyledButton>
              ))}
            </div>
          )}

          <div className={styles.scrollRegion}>
            {activeSection === 'menu' && (
              <ul className={styles.linkList}>
                {menuItems.map((item) => (
                  <MenuItemComponent
                    key={item.key}
                    item={item}
                    onItemClick={handleItemClick}
                  />
                ))}
              </ul>
            )}
            {hasSidebar && activeSection === 'sidebar' && (
              <div className={styles.sidebarPanel}>{sidebarContent}</div>
            )}
          </div>

          {quickActions && (
            <div className={styles.footer}>
              <div className={styles.quickActions}>
                <Menu
                  width={320}
                  position="top-end"
                  withinPortal={false}
                  shadow="md"
                >
                  <Menu.Target>
                    {renderQuickAction(
                      <FontAwesomeIcon icon={faComments} size="lg" />,
                      quickActions.unreadMessagesCount,
                      undefined,
                      'ariaLabels.quickAccessMessages',
                    )}
                  </Menu.Target>
                  <Menu.Dropdown>
                    <ChatNotificationItems
                      messages={unreadMessages}
                      onRoomSelect={handleMessageItemClick}
                    />
                  </Menu.Dropdown>
                </Menu>
                {enableSocial && (
                  <Menu
                    width={260}
                    position="top-end"
                    withinPortal={false}
                    shadow="md"
                  >
                    <Menu.Target>
                      {renderQuickAction(
                        <RpgAwesomeIcon
                          icon="double-team"
                          fw
                          style={{ fontSize: 18 }}
                        />,
                        quickActions.socialNotificationCount,
                        undefined,
                        'ariaLabels.quickAccessSocial',
                      )}
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>{t('interface.social')}</Menu.Label>
                      <Menu.Item
                        component={Link}
                        href="/social/friends"
                        leftSection={
                          <FontAwesomeIcon
                            icon={faIdCard}
                            size="sm"
                            stroke="1.5"
                          />
                        }
                      >
                        {tNav('social.friends')}
                      </Menu.Item>
                      {enableEnemies && (
                        <Menu.Item
                          component={Link}
                          href="/social/enemies"
                          leftSection={
                            <FontAwesomeIcon
                              icon={faSkullCrossbones}
                              size="sm"
                              stroke="1.5"
                            />
                          }
                        >
                          {tNav('social.enemies')}
                        </Menu.Item>
                      )}
                      <Menu.Item
                        component={Link}
                        href="/social/requests"
                        leftSection={
                          <FontAwesomeIcon
                            icon={faComments}
                            size="sm"
                            stroke="1.5"
                          />
                        }
                        rightSection={
                          <Badge
                            color="red"
                            variant="filled"
                            size="xs"
                            style={{
                              display:
                                quickActions.socialNotificationCount > 0
                                  ? 'inline-flex'
                                  : 'none',
                            }}
                          >
                            {quickActions.socialNotificationCount > 9
                              ? '9+'
                              : quickActions.socialNotificationCount}
                          </Badge>
                        }
                      >
                        {t('interface.friendRequests')}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
                <Menu
                  width={240}
                  position="top-end"
                  withinPortal={false}
                  shadow="md"
                >
                  <Menu.Target>
                    {renderQuickAction(
                      <FontAwesomeIcon icon={faGear} size="lg" />,
                      undefined,
                      undefined,
                      'ariaLabels.quickAccessSettings',
                    )}
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>{t('interface.settings')}</Menu.Label>
                    <Menu.Item
                      component={Link}
                      href="/home/settings"
                      leftSection={
                        <FontAwesomeIcon icon={faGear} size="sm" stroke="1.5" />
                      }
                    >
                      {t('interface.accountSettings')}
                    </Menu.Item>
                    <Menu.Item
                      component={Link}
                      href="/home/profile"
                      leftSection={
                        <FontAwesomeIcon
                          icon={faIdCard}
                          size="sm"
                          stroke="1.5"
                        />
                      }
                    >
                      {t('interface.profileSettings')}
                    </Menu.Item>
                    <Menu.Item
                      leftSection={
                        <FontAwesomeIcon
                          icon={faArrowRightFromBracket}
                          size="sm"
                          stroke="1.5"
                          color="indianred"
                        />
                      }
                      onClick={() => signOut({ callbackUrl: '/' })}
                    >
                      {t('logout')}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </div>
            </div>
          )}
        </div>
      </nav>
    </Drawer>
  );
};

export default MobileNavigation;
