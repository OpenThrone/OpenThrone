import { Button, Input, Modal as MantineModal } from '@mantine/core';
import router from 'next/router';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';

import { useUser } from '@/context/users';

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
}

/**
 * A modal component used to confirm the number of attack turns before initiating an attack.
 * Handles form submission, API interaction, loading state, error display, and redirection to results.
 */
const Modal: React.FC<ModalProps> = ({ isOpen, toggleModal, profileID }) => {
  const { t } = useTranslation('battle');
  const [turns, setTurns] = useState(1);
  const [turnsInput, setTurnsInput] = useState('1');
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
    if (!turns || isLoading) {
      setError(t('attack.invalidTurns'));
      return;
    }

    setIsLoading(true); // Set loading state
    setError(''); // Clear previous errors

    const res = await fetch(`/api/attack/${profileID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': buildIdempotencyKey(),
      },
      body: JSON.stringify({ turns }),
    });

    const results = await res.json();

    if (
      !res.ok ||
      results.status === 'failed' ||
      !results?.attack_log ||
      Number.isNaN(Number(results.attack_log))
    ) {
      setError(`Failed to execute attack. ${results?.message ?? 'Try again.'}`);
      setIsLoading(false); // Reset loading state on failure
    } else {
      // No need to set error here as it's cleared at the start
      forceUpdate();
      // Close the modal immediately after successful attack submission
      toggleModal();
      router.push(`/battle/results/${Number(results.attack_log)}`);
      // Reset loading state on success (though redirect might make this visually brief)
      setIsLoading(false);
    }
  };

  return (
    <MantineModal
      opened={isOpen}
      onClose={toggleModal}
      title={t('attack.turnsQuestion')}
      centered
      closeOnClickOutside={!isLoading}
      closeOnEscape={!isLoading}
      withCloseButton={!isLoading}
      data-testid="attack-modal"
    >
      <form onSubmit={handleSubmit}>
        <Input.Wrapper
          label={t('attack.turnsQuestion')}
          description={t('attack.turnsDescription')}
          error={error || undefined}
          mb="sm"
        >
          <input
            type="number"
            min="1"
            aria-label={t('attack.turnsQuestion')}
            value={turnsInput}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              const next = Number.isNaN(parsed) ? 0 : Math.max(parsed, 0);
              setTurnsInput(e.target.value);
              setTurns(next);
            }}
            data-testid="attack-turns-input"
            style={{ width: '100%' }}
          />
        </Input.Wrapper>
        <Button
          type="submit"
          loading={isLoading}
          disabled={isLoading}
          fullWidth
        >
          {isLoading ? t('attack.submitting') : t('attack.attack')}
        </Button>
      </form>
    </MantineModal>
  );
};

export default Modal;
