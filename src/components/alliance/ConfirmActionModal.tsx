import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

interface ConfirmActionModalProps {
  opened: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  loading?: boolean;
  /** When set, the user must type this exact text before confirming. */
  requiredText?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmation dialog for destructive alliance actions. */
export const ConfirmActionModal = ({
  opened,
  title,
  message,
  confirmLabel,
  loading = false,
  requiredText,
  onConfirm,
  onClose,
}: ConfirmActionModalProps) => {
  const { t } = useTranslation('alliances');
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!opened) setTyped('');
  }, [opened]);

  const blocked = requiredText !== undefined && typed !== requiredText;

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack gap="md">
        <Text size="sm">{message}</Text>
        {requiredText !== undefined && (
          <TextInput
            label={t('manage.typeToConfirm', 'Type "{{text}}" to confirm', {
              text: requiredText,
            })}
            value={typed}
            onChange={(event) => setTyped(event.currentTarget.value)}
            data-autofocus
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={loading}>
            {t('manage.cancel', 'Cancel')}
          </Button>
          <Button
            color="red"
            onClick={onConfirm}
            loading={loading}
            disabled={blocked}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
