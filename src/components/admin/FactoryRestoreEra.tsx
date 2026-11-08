import { Alert, Button, Checkbox, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useRef, useState } from 'react';

import ConfirmationModal from '@/components/ConfirmationModal';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import { eraResetPhrase } from '@/utils/eraResetPhrase';

interface FactoryRestoreEraProps {
  era: { id: number; name: string; startDate: string };
  canReset: boolean;
  onReset: () => void | Promise<void>;
}

/**
 * Complete factory restore (#13): the only era reset that deletes alliances.
 * Separate from the ordinary reset on purpose, with its own destructive
 * confirmation phrase; the ordinary reset keeps every alliance (reserved).
 */
const FactoryRestoreEra = ({
  era,
  canReset,
  onReset,
}: FactoryRestoreEraProps) => {
  const { t } = useTranslation('admin-game');
  const { config, error: runtimeConfigError } = useRuntimeConfig();
  const [opened, setOpened] = useState(false);
  const [enableLogins, setEnableLogins] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const phrase = eraResetPhrase(era.id, true);
  const canOpen =
    canReset && !!config && !runtimeConfigError && !config.eraResetInProgress;

  const close = () => {
    if (pendingRef.current) return;
    setOpened(false);
    setError(null);
  };

  const restore = async () => {
    if (!canOpen || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/game/factory-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eraId: era.id,
          expectedEraStartDate: era.startDate,
          confirmation: phrase,
          enableLogins,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : t('factoryRestore.requestError'),
        );
      }
      await onReset();
      setOpened(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('factoryRestore.requestError'),
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <>
      <Stack gap="xs" mt="md">
        <Text fw={700}>{t('factoryRestore.title')}</Text>
        <Text size="sm" c="dimmed">
          {t('factoryRestore.description')}
        </Text>
        <Group>
          <Button
            color="red"
            variant="outline"
            disabled={!canOpen}
            onClick={() => setOpened(true)}
          >
            {t('factoryRestore.openButton')}
          </Button>
        </Group>
      </Stack>
      <ConfirmationModal
        isOpen={opened}
        onClose={close}
        onConfirm={restore}
        title={t('factoryRestore.modalTitle')}
        message={t('factoryRestore.losses')}
        type="destructive"
        confirmText={t('factoryRestore.confirmButton')}
        cancelText={t('cancel')}
        isLoading={pending}
        confirmDisabled={!canOpen}
        requiredText={phrase}
        requiredTextLabel={t('eraReset.confirmLabel', { phrase })}
      >
        <Text size="sm">{t('eraReset.automaticClosure')}</Text>
        <Checkbox
          label={t('eraReset.enableLogins')}
          description={t('eraReset.enableLoginsDescription')}
          checked={enableLogins}
          disabled={pending}
          onChange={(event) => setEnableLogins(event.currentTarget.checked)}
        />
        {error && (
          <Alert color="red" role="alert" title={t('eraReset.errorTitle')}>
            {error}
          </Alert>
        )}
      </ConfirmationModal>
    </>
  );
};

export default FactoryRestoreEra;
