import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Group,
  Modal as MantineModal,
  NumberInput,
  Text,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import router from 'next/router';
import { useTranslation } from 'next-i18next';
import React, { useRef, useState } from 'react';

import { useUser } from '@/context/users';
import { logError } from '@/utils/logger';

/**
 * Props for the attack confirmation Modal component.
 */
interface ModalProps {
  /** Whether the modal is currently visible. */
  isOpen: boolean;
  /** Function to toggle the modal's visibility. */
  toggleModal: () => void;
  /** The ID of the user profile being targeted for attack. */
  profileID?: number;
  targetName?: string;
  allowNewTab?: boolean;
}

/**
 * A modal component used to confirm the number of attack turns before initiating an attack.
 * Handles form submission, API interaction, loading state, error display, and redirection to results.
 */
const Modal: React.FC<ModalProps> = ({
  isOpen,
  toggleModal,
  profileID,
  targetName,
  allowNewTab = false,
}) => {
  const { t } = useTranslation('battle');
  const submittingRef = useRef(false);
  const forfeitConfirmedRef = useRef(false);
  const [forfeitPrompt, setForfeitPrompt] = useState(false);
  const [newTab, setNewTab] = useLocalStorage({
    key: 'battle-report-new-tab',
    defaultValue: false,
  });
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [turns, setTurns] = useState(1);
  const [turnsInput, setTurnsInput] = useState<string | number>(1);
  const { forceUpdate } = useUser();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const buildIdempotencyKey = () =>
    `attack-${profileID ?? 'unknown'}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  /**
   * Handles the submission of the attack confirmation form.
   * Sends the attack request to the API, handles the response,
   * manages loading and error states, and redirects on success.
   * @param event - The form submission event.
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!Number.isSafeInteger(turns) || turns < 1) {
      setError(t('attack.invalidTurns'));
      return;
    }

    submittingRef.current = true;
    const reportTab =
      allowNewTab && newTab ? window.open('about:blank', '_blank') : null;
    if (reportTab) reportTab.opener = null;
    setForfeitPrompt(false);
    setIsLoading(true); // Set loading state
    setError(''); // Clear previous errors

    try {
      const res = await fetch(`/api/attack/${profileID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': buildIdempotencyKey(),
        },
        body: JSON.stringify({
          turns,
          ...(forfeitConfirmedRef.current
            ? { confirmProtectionForfeit: true }
            : {}),
        }),
      });
      const results = await res.json();
      if (results?.code === 'PROTECTION_FORFEIT_CONFIRMATION_REQUIRED') {
        reportTab?.close();
        forfeitConfirmedRef.current = false;
        setForfeitPrompt(true);
        return;
      }
      if (
        !res.ok ||
        results?.status === 'failed' ||
        !results?.attack_log ||
        Number.isNaN(Number(results.attack_log))
      ) {
        reportTab?.close();
        setError(
          typeof results?.message === 'string'
            ? results.message
            : t('attack.attackFailed'),
        );
        return;
      }
      forceUpdate();
      const url = `/battle/results/${Number(results.attack_log)}`;
      if (allowNewTab && newTab) {
        if (reportTab && !reportTab.closed) {
          reportTab.location.replace(url);
          toggleModal();
        } else {
          setReportUrl(url);
        }
      } else {
        toggleModal();
        await router.push(url);
      }
    } catch (error) {
      reportTab?.close();
      logError(error, { profileID }, 'Attack submission failed');
      setError(t('attack.attackFailed'));
    } finally {
      forfeitConfirmedRef.current = false;
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <MantineModal
      opened={isOpen}
      onClose={toggleModal}
      title={
        targetName
          ? t('actions.attackTarget', { name: targetName })
          : t('attack.turnsQuestion')
      }
      centered
      closeOnClickOutside={!isLoading}
      closeOnEscape={!isLoading}
      withCloseButton={!isLoading}
      data-testid="attack-modal"
    >
      {reportUrl ? (
        <Text role="status">
          {t('actions.reportReady')}{' '}
          <Anchor href={reportUrl} target="_blank" rel="noopener noreferrer">
            {t('actions.viewReport')}
          </Anchor>
        </Text>
      ) : (
        <form onSubmit={handleSubmit}>
          <NumberInput
            label={t('attack.turnsQuestion')}
            description={t('attack.turnsDescription')}
            error={error ? <span role="alert">{error}</span> : undefined}
            mb="sm"
            min={1}
            allowDecimal={false}
            allowNegative={false}
            value={turnsInput}
            disabled={isLoading}
            onChange={(value) => {
              setTurnsInput(value);
              const parsed = Number(value);
              setTurns(Number.isFinite(parsed) ? parsed : 0);
            }}
            data-testid="attack-turns-input"
          />
          {allowNewTab && (
            <Checkbox
              mb="md"
              checked={newTab}
              disabled={isLoading}
              onChange={(event) => setNewTab(event.currentTarget.checked)}
              label={t('actions.newTab')}
            />
          )}
          {forfeitPrompt && (
            <Alert
              color="yellow"
              mb="md"
              role="alert"
              title={t('attack.protectionForfeitTitle')}
            >
              {t('attack.protectionForfeitWarning')}
              <Group mt="sm" gap="xs">
                <Button
                  type="button"
                  variant="default"
                  size="xs"
                  disabled={isLoading}
                  onClick={() => setForfeitPrompt(false)}
                >
                  {t('attack.protectionForfeitCancel')}
                </Button>
                <Button
                  type="submit"
                  color="red"
                  size="xs"
                  loading={isLoading}
                  disabled={isLoading}
                  onClick={() => {
                    forfeitConfirmedRef.current = true;
                  }}
                >
                  {t('attack.protectionForfeitConfirm')}
                </Button>
              </Group>
            </Alert>
          )}
          <Button
            type="submit"
            loading={isLoading}
            disabled={isLoading}
            fullWidth
          >
            {isLoading ? t('attack.submitting') : t('attack.attack')}
          </Button>
        </form>
      )}
    </MantineModal>
  );
};

export default Modal;
