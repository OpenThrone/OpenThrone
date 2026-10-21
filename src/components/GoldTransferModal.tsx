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
import { GoldTransferSchema } from '@/lib/validation';
import {
  calculateTransferFee,
  getCompleteFriendTransferConfig,
} from '@/services/Config.service';
import type { Locales } from '@/types/typings';
import { toBigIntSafe } from '@/utils/jsonHelpers';
import { formatGold } from '@/utils/numberFormatting';

interface GoldTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: number;
  targetUserName: string;
  userGold: bigint;
  onTransferComplete: () => void;
}

/** Gold transfer modal. */
export function GoldTransferModal({
  isOpen,
  onClose,
  targetUserId,
  targetUserName,
  userGold,
  onTransferComplete,
}: GoldTransferModalProps) {
  const { t, i18n } = useTranslation('social');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, forceUpdate } = useUser();
  const locale = user?.locale ?? (i18n.language as Locales);
  const config = getCompleteFriendTransferConfig();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm({
    resolver: zodResolver(GoldTransferSchema),
    defaultValues: {
      amount: '',
      notes: '',
    },
  });

  const watchedAmount = watch('amount');
  const transferAmount = watchedAmount
    ? toBigIntSafe(watchedAmount)
    : BigInt(0);
  const feeAmount =
    transferAmount > BigInt(0)
      ? calculateTransferFee(transferAmount)
      : BigInt(0);
  const totalCost = transferAmount + feeAmount;

  const onSubmit = async (data: any) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/social/friends/${targetUserId}/transfer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': `transfer-${targetUserId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          },
          body: JSON.stringify({
            amount: data.amount,
            notes: data.notes,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('goldTransfer.transferFailed'));
      }

      forceUpdate();
      onTransferComplete();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('goldTransfer.transferFailed'),
      );
    } finally {
      setLoading(false);
    }
  };

  const goldAmount = (num: bigint) =>
    t('currency.goldAmount', { ns: 'common', amount: formatGold(num, locale) });

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={t('goldTransfer.modalTitle', { player: targetUserName })}
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
            label={t('goldTransfer.amountLabel')}
            placeholder={t('goldTransfer.amountPlaceholder')}
            {...register('amount')}
            required
            type="number"
            min={1000}
            max={Number(config.maxAmount)}
            step={1}
          />
          {errors.amount && (
            <Text c="red" size="sm">
              {errors.amount.message}
            </Text>
          )}

          <Paper withBorder radius="md" p="md" bg="var(--ot-inset)">
            <Text size="sm" mb="xs" c="var(--ot-muted)">
              {t('goldTransfer.summaryTitle')}
            </Text>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="var(--ot-body)">
                  {t('goldTransfer.amountRow')}
                </Text>
                <Text size="sm" c="var(--ot-heading)">
                  {goldAmount(transferAmount)}
                </Text>
              </Group>

              {feeAmount > BigInt(0) && (
                <Group justify="space-between">
                  <Text size="sm" c="var(--ot-body)">
                    {t('goldTransfer.feeRow', {
                      percent: config.feePercentage,
                    })}
                  </Text>
                  <Text size="sm" c="var(--ot-accent)">
                    {goldAmount(feeAmount)}
                  </Text>
                </Group>
              )}

              <Group
                justify="space-between"
                pt="xs"
                style={{ borderTop: '1px solid var(--ot-line)' }}
              >
                <Text size="sm" fw={600} c="var(--ot-heading)">
                  {t('goldTransfer.totalRow')}
                </Text>
                <Text size="sm" fw={600} c="var(--ot-accent)">
                  {goldAmount(totalCost)}
                </Text>
              </Group>

              <Text size="xs" c="dimmed" mt="xs">
                {t('goldTransfer.maxTransfer', {
                  amount: formatGold(config.maxAmount, locale),
                })}
              </Text>

              <Text size="xs" c="dimmed">
                {t('goldTransfer.availableGold', {
                  amount: formatGold(userGold, locale),
                })}
              </Text>

              {totalCost > userGold && (
                <Text size="xs" c="red">
                  {t('goldTransfer.insufficientGold')}
                </Text>
              )}
            </Stack>
          </Paper>

          <Textarea
            label={t('goldTransfer.notesLabel')}
            placeholder={t('goldTransfer.notesPlaceholder')}
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
              {t('goldTransfer.cancel')}
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={
                !watchedAmount ||
                toBigIntSafe(watchedAmount) <= BigInt(0) ||
                totalCost > userGold ||
                !config.enabled
              }
            >
              {t('goldTransfer.submit')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
