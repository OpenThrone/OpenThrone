import { Button, Group, Modal, Text } from '@mantine/core';
import React from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  type?: 'friend' | 'enemy' | 'remove' | 'cancel';
}

const CONFIRM_COLORS: Record<
  NonNullable<ConfirmationModalProps['type']>,
  string
> = {
  friend: 'green',
  enemy: 'red',
  remove: 'red',
  cancel: 'gray',
};

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
  type = 'friend',
}) => {
  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={title}
      centered
      closeOnClickOutside={!isLoading}
      closeOnEscape={!isLoading}
      withCloseButton={!isLoading}
      data-testid="confirmation-modal"
    >
      <Text size="sm" c="dimmed">
        {message}
      </Text>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose} disabled={isLoading}>
          {cancelText}
        </Button>
        <Button
          color={CONFIRM_COLORS[type] ?? 'blue'}
          onClick={onConfirm}
          loading={isLoading}
          disabled={isLoading}
          data-testid="confirmation-modal-confirm"
        >
          {confirmText}
        </Button>
      </Group>
    </Modal>
  );
};

export default ConfirmationModal;
