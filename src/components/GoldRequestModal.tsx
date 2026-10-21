import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { FRIEND_TRANSFER_NOTE_MAX_LENGTH } from '@/constants/FriendTransfer';
import { useUser } from '@/context/users';
import { GoldRequestSchema } from '@/lib/validation';
import { getCompleteFriendTransferConfig } from '@/services/Config.service';
import type { Locales } from '@/types/typings';
import { toLocale } from '@/utils/numberFormatting';

interface GoldRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: number;
  targetUserName: string;
  onRequestComplete: () => void;
}

/** Gold request modal. */
export function GoldRequestModal({
  isOpen,
  onClose,
  targetUserId,
  targetUserName,
  onRequestComplete,
}: GoldRequestModalProps) {
  const { t, i18n } = useTranslation('social');
  const locale = i18n.language as Locales;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { forceUpdate } = useUser();
  const config = getCompleteFriendTransferConfig();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm({
    resolver: zodResolver(GoldRequestSchema),
    defaultValues: {
      amount: '',
      friendId: targetUserId,
      notes: '',
    },
  });

  const watchedAmount = watch('amount');

  const onSubmit = async (data: any) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/social/gold-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: data.friendId,
          amount: data.amount,
          notes: data.notes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('goldRequests.requestFailed'));
      }

      forceUpdate();
      onRequestComplete();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('goldRequests.requestFailed'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={t('goldRequests.modalTitle', { player: targetUserName })}
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        {error && (
          <Alert color="red" mb="md">
            {error}
          </Alert>
        )}

        <Stack gap="md">
          <TextInput
            label={t('goldRequests.amountLabel')}
            placeholder={t('goldRequests.amountPlaceholder')}
            {...register('amount')}
            type="number"
            min={1000}
            max={Number(config.maxAmount)}
            step={100}
            required
          />
          {errors.amount && (
            <Text c="red" size="sm">
              {errors.amount.message}
            </Text>
          )}

          <Paper withBorder radius="md" p="md" bg="var(--ot-inset)">
            <Text size="sm" mb="xs" c="var(--ot-muted)">
              {t('goldRequests.infoTitle')}
            </Text>
            <Stack gap="xs">
              <Text size="xs" c="dimmed">
                {t('goldRequests.maxRequest', {
                  amount: toLocale(config.maxAmount, locale),
                })}
              </Text>
              <Text size="xs" c="dimmed">
                {t('goldRequests.recipientChoice')}
              </Text>
              <Text size="xs" c="dimmed">
                {t('goldRequests.expiryNotice')}
              </Text>
            </Stack>
          </Paper>

          <Textarea
            label={t('goldRequests.reasonLabel')}
            placeholder={t('goldRequests.reasonPlaceholder')}
            {...register('notes')}
            minRows={2}
            maxRows={3}
            maxLength={FRIEND_TRANSFER_NOTE_MAX_LENGTH}
            resize="vertical"
          />
          {errors.notes && (
            <Text c="red" size="sm">
              {errors.notes.message}
            </Text>
          )}

          <Group justify="flex-end" mt="md">
            <Button
              type="button"
              variant="default"
              onClick={onClose}
              disabled={loading}
            >
              {t('goldRequests.cancel')}
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={
                !watchedAmount ||
                BigInt(watchedAmount) <= BigInt(0) ||
                !config.enabled
              }
            >
              {t('goldRequests.sendRequest')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
