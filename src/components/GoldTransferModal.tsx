import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { getRequiredEconomyUpgradeName } from '@/constants/FeatureUnlocks';
import { FRIEND_TRANSFER_NOTE_MAX_LENGTH } from '@/constants/FriendTransfer';
import { useUser } from '@/context/users';
import { GoldTransferSchema } from '@/lib/validation';
import { getCompleteFriendTransferConfig } from '@/services/Config.service';
import type { Locales } from '@/types/typings';
import { toBigIntSafe } from '@/utils/jsonHelpers';
import { logError } from '@/utils/logger';
import { formatGold } from '@/utils/numberFormatting';

/** Daily gold transfer limits, as returned by the transfer-limits endpoint. */
export interface TransferLimits {
  /** Whether the player has unlocked gold transfers. */
  unlocked: boolean;
  /** Gold the player may send per day. */
  sendPerDay: string;
  /** Gold the player may receive per day. */
  receivePerDay: string;
  /** Percentage of the transfer that is destroyed as a fee. */
  feePercent: number;
  /** Gold already sent today. */
  sentToday: string;
  /** Gold already received today. */
  receivedToday: string;
}

interface GoldTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: number;
  targetUserName: string;
  userGold: bigint;
  onTransferComplete: () => void;
  /**
   * Preloaded limits. When given, the modal renders these instead of asking
   * the server for them (used by the visual guide to show both states).
   */
  limitsOverride?: TransferLimits;
}

/** Parses a gold amount that arrives as a digit string. */
const toAmountString = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return value.trim();
  }
  return '0';
};

/** Reads the transfer limits payload, ignoring anything unexpected. */
const parseTransferLimits = (data: unknown): TransferLimits => {
  const raw = (data ?? {}) as Partial<TransferLimits>;
  return {
    unlocked: raw.unlocked === true,
    sendPerDay: toAmountString(raw.sendPerDay),
    receivePerDay: toAmountString(raw.receivePerDay),
    feePercent:
      typeof raw.feePercent === 'number' && Number.isFinite(raw.feePercent)
        ? raw.feePercent
        : 0,
    sentToday: toAmountString(raw.sentToday),
    receivedToday: toAmountString(raw.receivedToday),
  };
};

/**
 * The previewed fee: floor(amount * percent / 100). The percentage is scaled
 * to hundredths first so a fractional percentage stays exact.
 */
const previewFee = (amount: bigint, percent: number): bigint => {
  if (amount <= BigInt(0) || percent <= 0) return BigInt(0);
  const hundredths = BigInt(Math.round(percent * 100));
  return (amount * hundredths) / BigInt(10000);
};

/** Gold transfer modal. */
export function GoldTransferModal({
  isOpen,
  onClose,
  targetUserId,
  targetUserName,
  userGold,
  onTransferComplete,
  limitsOverride,
}: GoldTransferModalProps) {
  const { t, i18n } = useTranslation('social');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<TransferLimits | null>(null);
  const [limitsLoading, setLimitsLoading] = useState(false);
  const [limitsError, setLimitsError] = useState<string | null>(null);
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

  // Ask the server for the daily limits whenever the modal opens.
  useEffect(() => {
    if (!isOpen || limitsOverride) return;

    let cancelled = false;

    const loadLimits = async () => {
      setLimitsLoading(true);
      setLimitsError(null);
      try {
        const response = await fetch('/api/social/friends/transfer-limits');
        if (!response.ok) {
          throw new Error(`Transfer limits request failed: ${response.status}`);
        }
        const data = await response.json();
        if (cancelled) return;
        setLimits(parseTransferLimits(data));
      } catch (err) {
        logError('GoldTransferModal: could not load transfer limits', err);
        if (!cancelled) setLimitsError(t('goldTransfer.limitsFailed'));
      } finally {
        if (!cancelled) setLimitsLoading(false);
      }
    };

    loadLimits();

    return () => {
      cancelled = true;
    };
  }, [isOpen, limitsOverride, t]);

  const activeLimits = limitsOverride ?? limits;
  const isLocked = activeLimits !== null && !activeLimits.unlocked;
  const upgradeName = getRequiredEconomyUpgradeName('GOLD_TRANSFER');

  const feePercent = activeLimits?.feePercent ?? config.feePercentage;
  const watchedAmount = watch('amount');
  const transferAmount = watchedAmount
    ? toBigIntSafe(watchedAmount)
    : BigInt(0);
  const feeAmount =
    transferAmount > BigInt(0)
      ? previewFee(transferAmount, feePercent)
      : BigInt(0);
  const totalCost = transferAmount + feeAmount;

  const sentToday = activeLimits ? toBigIntSafe(activeLimits.sentToday) : null;
  const sendPerDay = activeLimits
    ? toBigIntSafe(activeLimits.sendPerDay)
    : null;
  const remainingAllowance =
    sentToday !== null && sendPerDay !== null && sendPerDay > sentToday
      ? sendPerDay - sentToday
      : BigInt(0);
  const overAllowance =
    // The daily send limit counts the gift only; the fee is not part of it.
    activeLimits !== null && !isLocked && transferAmount > remainingAllowance;

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
          <Alert color="red" mb="md" role="alert">
            {error}
          </Alert>
        )}

        {limitsError && (
          <Alert color="yellow" mb="md" role="alert">
            {limitsError}
          </Alert>
        )}

        {isLocked && (
          <Alert
            color="yellow"
            mb="md"
            role="alert"
            title={t('goldTransfer.lockedTitle')}
          >
            {t('goldTransfer.locked', { upgrade: upgradeName ?? '' })}
          </Alert>
        )}

        <Stack gap="md">
          {!isLocked && (
            <>
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

                  <Text size="sm" c="var(--ot-accent)">
                    {t('goldTransfer.feeDestroyedRow', {
                      percent: feePercent,
                      amount: formatGold(feeAmount, locale),
                    })}
                  </Text>

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

                  {activeLimits && !isLocked && (
                    <>
                      <Text size="sm" c="var(--ot-body)" mt="xs">
                        {t('goldTransfer.sentToday', {
                          sent: formatGold(sentToday ?? BigInt(0), locale),
                          limit: formatGold(sendPerDay ?? BigInt(0), locale),
                        })}
                      </Text>

                      <Text size="xs" c="dimmed">
                        {t('goldTransfer.receiveLimitHint')}
                      </Text>
                    </>
                  )}

                  {limitsLoading && !isLocked && (
                    <Group gap={6} mt="xs">
                      <Loader size={12} />
                      <Text size="sm" c="var(--ot-muted)">
                        {t('goldTransfer.sentTodayLoading')}
                      </Text>
                    </Group>
                  )}

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

                  {overAllowance && (
                    <Text size="xs" c="red">
                      {t('goldTransfer.overDailyLimit', {
                        amount: formatGold(remainingAllowance, locale),
                      })}
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
            </>
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
                !config.enabled ||
                isLocked ||
                limitsLoading ||
                overAllowance
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
