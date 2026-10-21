import { Alert, Button, Checkbox, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useRef, useState } from 'react';

import ConfirmationModal from '@/components/ConfirmationModal';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import { resolveEraStartSettings } from '@/utils/eraStartSettings';

import EraStartSettingsFields, {
  type EraStartSettingsDraft,
  parseDraft,
  toDraft,
} from './EraStartSettingsFields';

interface ResetCurrentEraProps {
  era: {
    id: number;
    name: string;
    startDate: string;
    startSettings?: unknown;
  };
  canReset: boolean;
  onReset: () => void | Promise<void>;
}

const ResetCurrentEra = ({ era, canReset, onReset }: ResetCurrentEraProps) => {
  const { t } = useTranslation('admin-game');
  const {
    config,
    loading: runtimeConfigLoading,
    error: runtimeConfigError,
    mutate: mutateRuntimeConfig,
  } = useRuntimeConfig();
  const [opened, setOpened] = useState(false);
  const [enableLogins, setEnableLogins] = useState(true);
  const [draft, setDraft] = useState<EraStartSettingsDraft>(() =>
    toDraft(resolveEraStartSettings(era.startSettings)),
  );
  const startSettings = parseDraft(draft);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const confirmationPhrase = `RESET ERA ${era.id}`;
  const canOpenReset =
    canReset && !!config && !runtimeConfigError && !config.eraResetInProgress;

  const close = () => {
    if (pendingRef.current) return;
    setOpened(false);
    setError(null);
  };

  const resetEra = async () => {
    if (!canOpenReset || pendingRef.current || !startSettings) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/game/reset-current-era', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eraId: era.id,
          expectedEraStartDate: era.startDate,
          confirmation: confirmationPhrase,
          enableLogins,
          startSettings,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : t('eraReset.requestError'),
        );
      }
      await mutateRuntimeConfig();
      await onReset();
      setOpened(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('eraReset.requestError'),
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t('eraReset.description', { name: era.name })}
        </Text>
        {runtimeConfigLoading && (
          <Text size="sm" c="dimmed">
            {t('eraReset.runtimeConfigLoading')}
          </Text>
        )}
        {runtimeConfigError && (
          <Alert
            color="red"
            role="alert"
            title={t('eraReset.runtimeConfigError')}
          >
            <Group justify="space-between" mt="xs">
              <Text size="sm">{runtimeConfigError}</Text>
              <Button
                size="xs"
                variant="default"
                onClick={() => mutateRuntimeConfig()}
              >
                {t('retry')}
              </Button>
            </Group>
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          {t('eraReset.automaticClosure')}
        </Text>
        {config?.eraResetInProgress && (
          <Alert color="yellow">{t('eraSchedule.started')}</Alert>
        )}
        {config?.maintenance.enabled && (
          <Alert color="yellow">{t('eraReset.maintenanceNote')}</Alert>
        )}
        <Button
          disabled={!canOpenReset}
          onClick={() => {
            setDraft(toDraft(resolveEraStartSettings(era.startSettings)));
            setOpened(true);
          }}
        >
          {t('eraReset.openButton')}
        </Button>
      </Stack>

      <ConfirmationModal
        isOpen={opened}
        onClose={close}
        onConfirm={resetEra}
        title={t('eraReset.modalTitle')}
        message={t('eraReset.losses')}
        type="destructive"
        confirmText={
          enableLogins
            ? t('eraReset.confirmCombined')
            : t('eraReset.confirmResetOnly')
        }
        cancelText={t('cancel')}
        isLoading={pending}
        confirmDisabled={!canOpenReset || !startSettings}
        requiredText={confirmationPhrase}
        requiredTextLabel={t('eraReset.confirmLabel', {
          phrase: confirmationPhrase,
        })}
      >
        <Text size="sm">{t('eraReset.automaticClosure')}</Text>
        <Text size="sm" c="var(--ot-muted)">
          {t('eraReset.retained')}
        </Text>
        <EraStartSettingsFields
          value={draft}
          onChange={setDraft}
          disabled={pending}
        />
        <Text size="sm" c="var(--ot-muted)">
          {t('eraReset.baseline')}
        </Text>
        {config?.maintenance.enabled && (
          <Alert color="yellow">{t('eraReset.maintenanceNote')}</Alert>
        )}
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

export default ResetCurrentEra;
