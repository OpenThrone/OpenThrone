import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal as MantineModal,
  Stack,
  Text,
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import router from 'next/router';
import { useTranslation } from 'next-i18next';
import React, { useRef, useState } from 'react';

import AttackRecommendation from '@/components/battle/AttackRecommendation';
import QuantitySlider from '@/components/battle/QuantitySlider';
import { useUser } from '@/context/users';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import { logError } from '@/utils/logger';
import { clampMissionQuantity } from '@/utils/missionQuantity';

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
const { MAX_ATTACK_TURNS } = V5_COMBAT_CONSTANTS;

const Modal: React.FC<ModalProps> = ({
  isOpen,
  toggleModal,
  profileID,
  targetName,
  allowNewTab = false,
}) => {
  const { t } = useTranslation('battle');
  const submittingRef = useRef(false);
  const confirmationsRef = useRef({ alliance: false });
  const [alliancePrompt, setAlliancePrompt] = useState<string | null>(null);
  const [newTab, setNewTab] = useLocalStorage({
    key: 'battle-report-new-tab',
    defaultValue: false,
  });
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [requestedTurns, setTurns] = useState(1);
  const { user, forceUpdate } = useUser();
  const availableTurns =
    typeof user?.attackTurns === 'number' ? user.attackTurns : null;
  const maxTurns = Math.min(
    MAX_ATTACK_TURNS,
    availableTurns ?? MAX_ATTACK_TURNS,
  );
  const turns = clampMissionQuantity(requestedTurns, 1, maxTurns);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const resetConfirmations = () => {
    confirmationsRef.current = { alliance: false };
  };

  const cancelConfirmation = () => {
    resetConfirmations();
    setAlliancePrompt(null);
  };

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
    if (!Number.isSafeInteger(turns) || turns < 1 || turns > MAX_ATTACK_TURNS) {
      setError(t('attack.invalidTurns', { max: MAX_ATTACK_TURNS }));
      return;
    }
    if (availableTurns !== null && turns > availableTurns) {
      setError(t('attack.notEnoughTurns', { count: availableTurns }));
      return;
    }

    submittingRef.current = true;
    const reportTab =
      allowNewTab && newTab ? window.open('about:blank', '_blank') : null;
    if (reportTab) reportTab.opener = null;
    setAlliancePrompt(null);
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
          ...(confirmationsRef.current.alliance
            ? { confirmAllianceAttack: true }
            : {}),
        }),
      });
      const results = await res.json();
      if (results?.code === 'ALLIANCE_MEMBER_CONFIRMATION_REQUIRED') {
        reportTab?.close();
        confirmationsRef.current.alliance = false;
        const allianceName = results?.extra_variables?.allianceName;
        setAlliancePrompt(
          typeof allianceName === 'string' && allianceName
            ? allianceName
            : t('attack.allianceAttackFallbackName'),
        );
        return;
      }
      resetConfirmations();
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
      resetConfirmations();
      reportTab?.close();
      logError(error, { profileID }, 'Attack submission failed');
      setError(t('attack.attackFailed'));
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <MantineModal
      size={560}
      padding="lg"
      opened={isOpen}
      onClose={() => {
        cancelConfirmation();
        toggleModal();
      }}
      title={
        targetName
          ? t('actions.attackTarget', { name: targetName })
          : t('attack.turnsQuestion')
      }
      yOffset="5vh"
      styles={{
        body: { scrollbarGutter: 'stable' },
        content: {
          maxHeight: '90dvh',
          overflowY: 'auto',
          scrollbarGutter: 'stable',
        },
      }}
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
          <Stack gap="lg" mb="lg">
            <Text size="sm" c="var(--ot-muted)">
              {availableTurns !== null
                ? t('attack.turnsAvailable', {
                    count: availableTurns,
                    max: MAX_ATTACK_TURNS,
                  })
                : t('attack.turnsDescription')}
            </Text>
            <QuantitySlider
              label={t('commitment.turnsLabel')}
              description={maxTurns < 1 ? t('commitment.noTurns') : undefined}
              min={1}
              max={maxTurns}
              value={turns}
              disabled={isLoading}
              onChange={(value) => {
                setTurns(value);
                setError('');
                cancelConfirmation();
              }}
              inputTestId="attack-turns-input"
            />
            {error && (
              <Text size="sm" c="red" role="alert">
                {error}
              </Text>
            )}
          </Stack>
          {allowNewTab && (
            <Checkbox
              mb="md"
              checked={newTab}
              disabled={isLoading}
              onChange={(event) => setNewTab(event.currentTarget.checked)}
              label={t('actions.newTab')}
            />
          )}
          {alliancePrompt !== null && (
            <Alert
              color="orange"
              mb="md"
              role="alert"
              title={t('attack.allianceAttackTitle')}
            >
              {t('attack.allianceAttackWarning', { alliance: alliancePrompt })}
              <Group mt="sm" gap="xs">
                <Button
                  type="button"
                  variant="default"
                  size="xs"
                  disabled={isLoading || !turns}
                  onClick={cancelConfirmation}
                >
                  {t('attack.allianceAttackCancel')}
                </Button>
                <Button
                  type="submit"
                  color="red"
                  size="xs"
                  loading={isLoading}
                  disabled={isLoading || !turns}
                  onClick={() => {
                    confirmationsRef.current.alliance = true;
                  }}
                >
                  {t('attack.allianceAttackConfirm')}
                </Button>
              </Group>
            </Alert>
          )}
          <Divider my="lg" />
          <Stack gap="sm" mb="sm">
            <Group justify="space-between" gap="xs">
              <Text size="sm" c="var(--ot-muted)">
                {t('commitment.attack')}
              </Text>
              <Text size="sm" fw={600} c="var(--ot-heading)">
                {t('commitment.turnCount', { count: turns })}
              </Text>
            </Group>
            {availableTurns !== null && (
              <Group justify="space-between" gap="xs">
                <Text size="xs" c="var(--ot-muted)">
                  {t('commitment.remainingTurns')}
                </Text>
                <Text size="xs" c="var(--ot-muted)">
                  {Math.max(0, availableTurns - turns)}
                </Text>
              </Group>
            )}
          </Stack>
          <Button
            type="submit"
            loading={isLoading}
            disabled={isLoading || !turns || alliancePrompt !== null}
            fullWidth
            styles={{
              root: { height: 'auto', minHeight: 42 },
              label: { whiteSpace: 'normal', height: 'auto', paddingBlock: 10 },
            }}
          >
            {isLoading ? t('attack.submitting') : t('attack.attack')}
          </Button>
          <AttackRecommendation
            targetId={profileID}
            viewerId={user?.id}
            opened={isOpen}
          />
        </form>
      )}
    </MantineModal>
  );
};

export default Modal;
