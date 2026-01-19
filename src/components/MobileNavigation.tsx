/**
 * Example Usage:
 *
 * import { useState } from 'react';
 * import MobileNavigation from './MobileNavigation';
 *
 * const MyComponent = () => {
 *   const [isMenuOpen, setIsMenuOpen] = useState(false);
 *
 *   const menuItems = [
 *     { key: 'home', label: 'Home', href: '/' },
 *     { key: 'about', label: 'About', href: '/about' },
 *     { key: 'logout', label: 'Logout', onClick: () => console.log('Logout clicked') },
 *   ];
 *
 *   return (
 *     <div>
 *       <button onClick={() => setIsMenuOpen(true)}>Open Menu</button>
 *       <MobileNavigation
 *         open={isMenuOpen}
 *         onClose={() => setIsMenuOpen(false)}
 *         menuItems={menuItems}
 *       />
 *     </div>
 *   );
 * };
 */

import {
  faArrowRightFromBracket,
  faComments,
  faGear,
  faIdCard,
  faSkullCrossbones,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Badge, Group, Menu, ScrollArea, SegmentedControl, Text } from '@mantine/core';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useRef, useState } from 'react';

import styles from '@/components/MobileNavigation.module.css';
import { useUser } from '@/context/users';
import { formatLastMessageTime } from '@/utils/timefunctions';

import RpgAwesomeIcon from './RpgAwesomeIcon';

type MenuItem = {
  key: string;
  label: string;
  href?: string;
  onClick?: () => void;
  children?: MenuItem[];
};

type QuickActionsData = {
  unreadMessagesCount: number;
  socialNotificationCount: number;
  onMessagesClick: () => void;
  onSocialClick: () => void;
  onSettingsClick: () => void;
};

const FOCUSABLE_ELEMENT_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MenuItemComponent: React.FC<{
  item: MenuItem;
  onItemClick: (onClick?: () => void) => void;
}> = ({ item, onItemClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const currentPath = router.asPath?.split('?')[0] ?? '/';
  const isActive = currentPath === item.href;
  const isChildActive =
    item.children?.some((child) => currentPath === child.href) ?? false;

  const hasChildren = item.children && item.children.length > 0;

  const handleToggle = () => {
    if (hasChildren) {
      setIsOpen(!isOpen);
    }
  };

  const shouldUseButton = Boolean(item.onClick) || hasChildren || !item.href;
  const itemClasses = `${styles.link} ${isActive || isChildActive ? styles.linkActive : ''}`;

  return (
    <li className={styles.linkItem}>
      {shouldUseButton ? (
        <button
          onClick={(e) => {
            if (item.onClick) {
              e.preventDefault();
              onItemClick(item.onClick);
            } else if (hasChildren) {
              e.preventDefault();
              handleToggle();
            } else {
              onItemClick();
            }
          }}
          className={itemClasses}
          aria-expanded={hasChildren ? isOpen : undefined}
        >
          <span>{item.label}</span>
          {hasChildren && (
            <span
              className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
              aria-hidden="true"
            >
              &#9662;
            </span>
          )}
        </button>
      ) : (
        <Link
          href={item.href}
          onClick={() => onItemClick()}
          className={itemClasses}
        >
          <span>{item.label}</span>
        </Link>
      )}
      {hasChildren && isOpen && (
        <ul className={styles.subList}>
          {item.children?.map((child) => (
            <MenuItemComponent
              key={child.key}
              item={child}
              onItemClick={onItemClick}
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
  const { unreadMessages, markRoomAsRead } = useUser();
  const menuRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [activeSection, setActiveSection] = useState<'menu' | 'sidebar'>(
    'menu',
  );
  const hasSidebar = Boolean(sidebarContent);
  const touchStartX = useRef<number>(0);
  const enableEnemies = process.env.NEXT_PUBLIC_ENABLE_ENEMIES === 'true';

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = '';
      return undefined;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = menuRef.current;

    const getFocusableElements = () => {
      if (!panel) {
        return [] as HTMLElement[];
      }
      return Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENT_SELECTOR),
      ).filter(
        (element) =>
          !element.hasAttribute('disabled') &&
          element.getAttribute('aria-hidden') !== 'true',
      );
    };

    const focusInitialElement = () => {
      const focusableElements = getFocusableElements();
      const primaryFocus = closeButtonRef.current ?? focusableElements[0];
      primaryFocus?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (!focusableElements.length) {
          return;
        }
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.body.style.overflow = 'hidden';
    focusInitialElement();
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

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
    if (deltaX > 50) {
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
    <button
      type="button"
      className={styles.quickActionButton}
      onClick={onClick}
      aria-label={t(labelKey)}
    >
      {icon}
      {badgeCount && badgeCount > 0 && (
        <span className={styles.quickActionBadge} aria-hidden="true">
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
    </button>
  );

  const handleMessageItemClick = (roomId: number) => {
    markRoomAsRead(roomId);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      className={`fixed inset-0 z-[1200] ${open ? 'block' : 'hidden'} ${className}`}
    >
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-label={t('ariaLabels.closeNavigationMenu')}
      />

      {/* Menu */}
      <nav
        ref={menuRef}
        className={`${styles.panel} ${
          open ? styles.panelOpen : styles.panelClosed
        }`}
        aria-label={t('ariaLabels.mobileNavigation')}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="relative flex h-full flex-col p-4">
          <div className={styles.headerCard}>
            <div className={styles.eyebrow}>OpenThrone</div>
            <h2 className={styles.title}>Menu</h2>
            <div className={styles.divider} />
          </div>
          {hasSidebar && (
            <SegmentedControl
              value={activeSection}
              onChange={(value) =>
                setActiveSection(value as 'menu' | 'sidebar')
              }
              data={[
                { label: 'Menu', value: 'menu' },
                { label: 'Sidebar', value: 'sidebar' },
              ]}
              data-testid="mobile-nav-segmented"
              className={styles.segmentedRoot}
              classNames={{
                control: styles.segmentedControl,
                indicator: styles.segmentedIndicator,
                label: styles.segmentedLabel,
              }}
            />
          )}
          <div className="mt-3 flex-1 overflow-y-auto pr-1">
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
          <div className={styles.footer}>
            {quickActions && (
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
                    <Menu.Label>Recent Unread Messages</Menu.Label>
                    {unreadMessages.length === 0 ? (
                      <Menu.Item disabled>No unread messages</Menu.Item>
                    ) : (
                      <ScrollArea.Autosize mah={260}>
                        {unreadMessages
                          .sort(
                            (a, b) =>
                              new Date(b.timestamp).getTime() -
                              new Date(a.timestamp).getTime(),
                          )
                          .slice(0, 10)
                          .map((msg) => (
                            <Menu.Item
                              key={msg.id}
                              component={Link}
                              href={`/messaging?roomId=${msg.chatRoomId}`}
                              onClick={() =>
                                handleMessageItemClick(msg.chatRoomId)
                              }
                              style={{
                                whiteSpace: 'normal',
                                height: 'auto',
                                paddingTop: '8px',
                                paddingBottom: '8px',
                              }}
                            >
                              <div>
                                <Group justify="space-between" mb={4}>
                                  <Text fw={500} size="sm" truncate>
                                    {msg.senderName}
                                  </Text>
                                  <Text c="dimmed" size="xs">
                                    {formatLastMessageTime(msg.timestamp)}
                                  </Text>
                                </Group>
                                <Text size="xs" lineClamp={2}>
                                  {msg.content}
                                </Text>
                              </div>
                            </Menu.Item>
                          ))}
                      </ScrollArea.Autosize>
                    )}
                    <Menu.Divider />
                    <Menu.Item component={Link} href="/messaging">
                      See all messages
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                <Menu
                  width={260}
                  position="top-end"
                  withinPortal={false}
                  shadow="md"
                >
                  <Menu.Target>
                    {renderQuickAction(
                      <RpgAwesomeIcon icon="double-team" fw style={{ fontSize: 18 }} />,
                      quickActions.socialNotificationCount,
                      undefined,
                      'ariaLabels.quickAccessSocial',
                    )}
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>Social</Menu.Label>
                    <Menu.Item
                      component={Link}
                      href="/social/friends"
                      leftSection={
                        <FontAwesomeIcon icon={faIdCard} size="sm" stroke="1.5" />
                      }
                    >
                      Friends
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
                        Enemies
                      </Menu.Item>
                    )}
                    <Menu.Item
                      component={Link}
                      href="/social/requests"
                      leftSection={
                        <FontAwesomeIcon icon={faComments} size="sm" stroke="1.5" />
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
                      Friend Requests
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
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
                    <Menu.Label>Settings</Menu.Label>
                    <Menu.Item
                      component={Link}
                      href="/home/settings"
                      leftSection={
                        <FontAwesomeIcon icon={faGear} size="sm" stroke="1.5" />
                      }
                    >
                      Account settings
                    </Menu.Item>
                    <Menu.Item
                      component={Link}
                      href="/home/profile"
                      leftSection={
                        <FontAwesomeIcon icon={faIdCard} size="sm" stroke="1.5" />
                      }
                    >
                      Profile Settings
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
                      Logout
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </div>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className={styles.closeButton}
              aria-label={t('ariaLabels.closeNavigationPanel')}
            >
              &times;
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
};

export default MobileNavigation;
