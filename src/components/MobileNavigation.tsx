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

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';

import { SegmentedControl } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faComments, faGear } from '@fortawesome/free-solid-svg-icons';

import styles from '@/components/MobileNavigation.module.css';
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
  const pathname = usePathname();
  const isActive = pathname === item.href;
  const isChildActive =
    item.children?.some((child) => pathname === child.href) ?? false;

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
  const menuRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [activeSection, setActiveSection] = useState<'menu' | 'sidebar'>('menu');
  const hasSidebar = Boolean(sidebarContent);
  const touchStartX = useRef<number>(0);

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
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENT_SELECTOR)).filter(
        (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
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
    onClick: () => void,
    label: string,
  ) => (
    <button
      type="button"
      className={styles.quickActionButton}
      onClick={onClick}
      aria-label={label}
    >
      {icon}
      {badgeCount && badgeCount > 0 && (
        <span className={styles.quickActionBadge} aria-hidden="true">
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      className={`fixed inset-0 z-50 ${open ? 'block' : 'hidden'} ${className}`}
    >
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ease-in-out ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-label="Close navigation menu"
      />

      {/* Menu */}
      <div
        ref={menuRef}
        className={`${styles.panel} ${
          open ? styles.panelOpen : styles.panelClosed
        }`}
        role="navigation"
        aria-label="Mobile navigation"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="relative flex h-full flex-col p-4">
          <div className={styles.headerCard}>
            <div className={styles.eyebrow}>
              OpenThrone
            </div>
            <h2 className={styles.title}>
              Menu
            </h2>
            <div className={styles.divider} />
          </div>
          {hasSidebar && (
            <SegmentedControl
              value={activeSection}
              onChange={(value) => setActiveSection(value as 'menu' | 'sidebar')}
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
                  <MenuItemComponent key={item.key} item={item} onItemClick={handleItemClick} />
                ))}
              </ul>
            )}
            {hasSidebar && activeSection === 'sidebar' && (
              <div className={styles.sidebarPanel}>
                {sidebarContent}
              </div>
            )}
          </div>
          <div className={styles.footer}>
            {quickActions && (
              <div className={styles.quickActions}>
                {renderQuickAction(
                  <FontAwesomeIcon icon={faComments} size="lg" />, 
                  quickActions.unreadMessagesCount,
                  quickActions.onMessagesClick,
                  'Quick access messages',
                )}
                {renderQuickAction(
                  <RpgAwesomeIcon icon="player" fw style={{ fontSize: 18 }} />, 
                  quickActions.socialNotificationCount,
                  quickActions.onSocialClick,
                  'Quick access social',
                )}
                {renderQuickAction(
                  <FontAwesomeIcon icon={faGear} size="lg" />, 
                  undefined,
                  quickActions.onSettingsClick,
                  'Quick access settings',
                )}
              </div>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className={styles.closeButton}
              aria-label="Close navigation panel"
            >
              &times;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileNavigation;
