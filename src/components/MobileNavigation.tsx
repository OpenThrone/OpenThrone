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

import { usePathname } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';

type MenuItem = {
  key: string;
  label: string;
  href?: string;
  onClick?: () => void;
  children?: MenuItem[];
};

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

  return (
    <li className="border-b border-gray-700">
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
        className={`flex w-full min-h-[48px] items-center justify-between rounded-md p-4 text-lg transition-colors hover:bg-gray-700 ${
          isActive || isChildActive ? 'bg-gray-700' : ''
        }`}
        aria-expanded={isOpen}
      >
        <span>{item.label}</span>
        {hasChildren && (
          <span
            className={`transform transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          >
            &#9662;
          </span>
        )}
      </button>
      {hasChildren && isOpen && (
        <ul className="pl-4">
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
  sidebarContent?: React.ReactNode; // New prop for sidebar content
  className?: string;
};

const MobileNavigation: React.FC<MobileNavigationProps> = ({
  open,
  onClose,
  menuItems,
  sidebarContent, // Destructure new prop
  className = '',
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const handleItemClick = (itemOnClick?: () => void) => {
    if (itemOnClick) {
      itemOnClick();
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      className={`fixed inset-0 z-50 ${open ? 'block' : 'hidden'} ${className}`}
    >
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 transition-opacity duration-300 ease-in-out ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-label="Close navigation menu"
      />

      {/* Menu */}
      <div
        ref={menuRef}
        className={`fixed top-0 right-0 h-full w-64 bg-gray-800 text-white shadow-xl transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="navigation"
        aria-label="Mobile navigation"
      >
        <div className="p-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 flex h-12 w-12 items-center justify-center rounded-full text-2xl text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
            aria-label="Close menu"
          >
            &times;
          </button>
          <h2 className="mt-12 text-xl font-bold">Menu</h2>
          <ul className="mt-4">
            {menuItems.map((item) => (
              <MenuItemComponent key={item.key} item={item} onItemClick={handleItemClick} />
            ))}
          </ul>
          {sidebarContent && ( // Render sidebar content if provided
            <div className="mt-4 p-4 border-t border-gray-700">
              {sidebarContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileNavigation;