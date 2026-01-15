import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useUser } from '@/context/users';
import { GoldTransferSchema } from '@/lib/validation';
import {
  calculateTransferFee,
  getCompleteFriendTransferConfig,
} from '@/services/Config.service';

interface GoldTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: number;
  targetUserName: string;
  userGold: bigint;
  onTransferComplete: () => void;
}

export function GoldTransferModal({
  isOpen,
  onClose,
  targetUserId,
  targetUserName,
  userGold,
  onTransferComplete,
}: GoldTransferModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { forceUpdate } = useUser();
  const config = getCompleteFriendTransferConfig();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm({
    resolver: zodResolver(GoldTransferSchema),
    defaultValues: {
      amount: '',
      notes: '',
    },
  });

  const watchedAmount = watch('amount');
  const transferAmount = watchedAmount ? BigInt(watchedAmount) : BigInt(0);
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: data.amount,
            notes: data.notes,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transfer failed');
      }

      forceUpdate();
      onTransferComplete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: bigint): string => {
    return num.toLocaleString();
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={`Transfer Gold to ${targetUserName}`}
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
            label="Transfer Amount"
            placeholder="Enter amount (numbers only)"
            {...register('amount')}
            required
            type="number"
            min={1000}
            max={Number(config.maxAmount)}
            step={1}
          />
          {errors.amount && (
            <Text color="red" size="sm">
              {errors.amount.message}
            </Text>
          )}

          {/* Transfer Summary */}
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
            <Text size="sm" mb="xs" className="text-gray-400">
              Transfer Summary
            </Text>
            <Stack gap="xs">
              <Group justify="space-between">
                <span className="text-gray-300">Transfer Amount:</span>
                <span className="text-white">
                  {formatNumber(transferAmount)} gold
                </span>
              </Group>

              {feeAmount > BigInt(0) && (
                <Group justify="space-between">
                  <span className="text-gray-300">
                    Transfer Fee ({config.feePercentage}%):
                  </span>
                  <span className="text-yellow-400">
                    {formatNumber(feeAmount)} gold
                  </span>
                </Group>
              )}

              <Group
                justify="space-between"
                className="border-t border-gray-700 pt-2"
              >
                <span className="font-medium text-white">Total Cost:</span>
                <span className="font-medium text-green-400">
                  {formatNumber(totalCost)} gold
                </span>
              </Group>

              <Text size="xs" color="dimmed" mt="xs">
                Maximum transfer: {formatNumber(config.maxAmount)} gold
              </Text>

              <Text size="xs" color="dimmed">
                Your available gold: {formatNumber(userGold)} gold
              </Text>

              {totalCost > userGold && (
                <Text size="xs" color="red">
                  Insufficient gold for this transfer
                </Text>
              )}
            </Stack>
          </div>

          <Textarea
            label="Optional Notes"
            placeholder="Add a message for your friend"
            {...register('notes')}
            minRows={2}
            maxRows={3}
            maxLength={500}
            resize="vertical"
          />
          {errors.notes && (
            <Text color="red" size="sm">
              {errors.notes.message}
            </Text>
          )}

          <Group justify="flex-end" mt="md">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={
                !watchedAmount ||
                BigInt(watchedAmount) <= BigInt(0) ||
                totalCost > userGold ||
                !config.enabled
              }
            >
              Transfer Gold
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
