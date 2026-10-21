import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { ReactNode } from 'react';
import React, { useEffect, useState } from 'react';

/**
 * Consequence tone of a confirmation. Pick it from what the action costs:
 * - `destructive`: loses data, gold, units or access (red).
 * - `primary`: a significant but recoverable action (theme primary).
 * - `positive`: a constructive action such as adding a friend (green).
 *
 * `remove`, `enemy` and `friend` are legacy aliases kept for older callers.
 */
export type ConfirmationTone =
  | 'destructive'
  | 'primary'
  | 'positive'
  | 'remove'
  | 'enemy'
  | 'friend';

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  message?: ReactNode;
  /** Required: the confirm colour follows the consequence, never a default. */
  type: ConfirmationTone;
  confirmText?: ReactNode;
  cancelText?: ReactNode;
  /** While busy the dialog cannot be dismissed (outside click, Escape, X). */
  isLoading?: boolean;
  /** When set, the user must type this exact text before confirming. */
  requiredText?: string;
  /** Overrides the default "Type "{{text}}" to confirm" label. */
  requiredTextLabel?: ReactNode;
  /** Extra disabled condition for the confirm button (e.g. empty password). */
  confirmDisabled?: boolean;
  /** Extra content between the message and the footer (e.g. a password). */
  children?: ReactNode;
  size?: string | number;
}

const TONE_COLORS: Record<ConfirmationTone, string | undefined> = {
  destructive: 'red',
  remove: 'red',
  enemy: 'red',
  // undefined = Mantine theme primary colour (follows the race palette).
  primary: undefined,
  positive: 'green',
  friend: 'green',
};

/** The single confirmation dialog used across the app. */
const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type,
  confirmText,
  cancelText,
  isLoading = false,
  requiredText,
  requiredTextLabel,
  confirmDisabled = false,
  children,
  size,
}) => {
  const { t } = useTranslation('common');
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!isOpen) setTyped('');
  }, [isOpen]);

  const gated =
    requiredText !== undefined && typed.trim() !== requiredText.trim();

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={title}
      size={size}
      centered
      closeOnClickOutside={!isLoading}
      closeOnEscape={!isLoading}
      withCloseButton={!isLoading}
      closeButtonProps={{ 'aria-label': t('buttons.close', 'Close') }}
      data-testid="confirmation-modal"
    >
      <Stack gap="md">
        {message !== undefined && message !== null && message !== '' && (
          <Text size="sm" c="var(--ot-muted)">
            {message}
          </Text>
        )}
        {children}
        {requiredText !== undefined && (
          <TextInput
            label={
              requiredTextLabel ??
              t('buttons.typeToConfirm', 'Type "{{text}}" to confirm', {
                text: requiredText,
              })
            }
            value={typed}
            onChange={(event) => setTyped(event.currentTarget.value)}
            disabled={isLoading}
            autoComplete="off"
            data-autofocus
            data-testid="confirmation-modal-required-text"
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={isLoading}>
            {cancelText ?? t('buttons.cancel', 'Cancel')}
          </Button>
          <Button
            color={TONE_COLORS[type]}
            onClick={onConfirm}
            loading={isLoading}
            disabled={isLoading || gated || confirmDisabled}
            data-testid="confirmation-modal-confirm"
          >
            {confirmText ?? t('buttons.confirm', 'Confirm')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default ConfirmationModal;
