{`import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MobileNavigation from './MobileNavigation';

// Define mock outside of describe block
const mockOnClick = jest.fn();
const mockMenuItems = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'about', label: 'About', href: '/about' },
  { key: 'logout', label: 'Logout', onClick: mockOnClick },
];

describe('MobileNavigation Component', () => {
  // Reset mocks before each test
  beforeEach(() => {
    mockOnClick.mockClear();
  });

  test('should not be visible when open is false', () => {
    const handleClose = jest.fn();
    render(
      <MobileNavigation
        open={false}
        onClose={handleClose}
        menuItems={mockMenuItems}
      />
    );
    // The dialog is in the DOM but not visible
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).not.toBeVisible();
  });

  test('should be visible when open is true', () => {
    const handleClose = jest.fn();
    render(
      <MobileNavigation
        open={true}
        onClose={handleClose}
        menuItems={mockMenuItems}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeVisible();
    expect(screen.getByText('Home')).toBeVisible();
    expect(screen.getByText('About')).toBeVisible();
    expect(screen.getByText('Logout')).toBeVisible();
  });

  test('should call onClose when the overlay is clicked', () => {
    const handleClose = jest.fn();
    render(
      <MobileNavigation
        open={true}
        onClose={handleClose}
        menuItems={mockMenuItems}
      />
    );
    const overlay = screen.getByLabelText('Close navigation menu');
    fireEvent.click(overlay);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  test('should call onClose when the Escape key is pressed', () => {
    const handleClose = jest.fn();
    render(
      <MobileNavigation
        open={true}
        onClose={handleClose}
        menuItems={mockMenuItems}
      />
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  test('should call item onClick and then onClose when a menu item is clicked', () => {
    const handleClose = jest.fn();
    render(
      <MobileNavigation
        open={true}
        onClose={handleClose}
        menuItems={mockMenuItems}
      />
    );
    const logoutButton = screen.getByText('Logout');
    fireEvent.click(logoutButton);
    expect(mockOnClick).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  test('should have a minimum touch target size for menu items', () => {
    const handleClose = jest.fn();
    render(
      <MobileNavigation
        open={true}
        onClose={handleClose}
        menuItems={mockMenuItems}
      />
    );
    const menuItem = screen.getByText('Home').closest('a');
    expect(menuItem).toHaveClass('min-h-[48px]');
  });
});
`}