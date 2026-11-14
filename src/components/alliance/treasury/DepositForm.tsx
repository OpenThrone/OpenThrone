import { Anchor, Button, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { useAllianceUpgradeStatus } from '@/components/alliance/AllianceUpgrades';
import QuantityInput from '@/components/battle/QuantityInput';
import { GameCard } from '@/components/game/GameCard';
import {
  allianceLevelNameKey,
  allianceUpgradesHref,
  getAllianceLevel,
} from '@/constants/allianceLevels';
import { useUser } from '@/context/users';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import { alertService } from '@/services/Alert.service';
import type { Locales } from '@/types/typings';
import { allianceApiError } from '@/utils/allianceErrorMessage';
import { DEPOSIT_CAP_PERCENT, getMaxDeposit } from '@/utils/bankLimits';
import { formatWhole } from '@/utils/formatWhole';
import { toBigIntSafe } from '@/utils/jsonHelpers';

interface DepositFormProps {
  allianceId: number;
  onDone: () => void;
}

/**
 * Deposit into the treasury, capped like the personal bank deposit, by the
 * Alliance Hall's deposits per 24 hours and by its treasury cap.
 */
export const DepositForm = ({ allianceId, onDone }: DepositFormProps) => {
  const { t, i18n } = useTranslation('allianceTreasury');
  const { t: tAlliances } = useTranslation('alliances');
  const { user, forceUpdate } = useUser();
  const [amount, setAmount] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const { config } = useRuntimeConfig();
  const { data: hall, mutate: reloadHall } =
    useAllianceUpgradeStatus(allianceId);
  const locale = i18n.language as Locales;
  const capPercent = config?.depositCapPercent ?? DEPOSIT_CAP_PERCENT;
  const handCap = getMaxDeposit(toBigIntSafe(user?.gold), capPercent);

  // Hall limits (shown once the status loads; the server enforces them).
  const level = getAllianceLevel(hall?.hallLevel);
  const levelName = tAlliances(allianceLevelNameKey(level.level), level.name);
  const treasury = toBigIntSafe(hall?.treasury);
  const room = level.treasuryCap > treasury ? level.treasuryCap - treasury : 0n;
  const slotsLeft = hall
    ? Math.max(0, hall.deposits.limit - hall.deposits.used)
    : null;
  const noSlots = slotsLeft === 0;
  const maxDeposit = hall && room < handCap ? room : handCap;
  const overHand = amount > handCap;
  const overRoom = !!hall && amount > room;

  const submit = async () => {
    if (amount <= 0n || overHand || overRoom || noSlots || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/alliances/bank/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `alliance-deposit-${allianceId}-${amount}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify({ allianceId, amount: amount.toString() }),
      });
      const data = await res.json();
      if (!res.ok) throw allianceApiError(data, res.status);
      alertService.success(t('depositSuccess'));
      setAmount(0n);
      forceUpdate();
      onDone();
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setLoading(false);
      reloadHall();
    }
  };

  const error = overHand
    ? t('depositOverCap', { percent: capPercent })
    : overRoom
      ? t('depositOverRoom', { room: formatWhole(room, locale) })
      : undefined;

  return (
    <GameCard title={t('depositTitle')}>
      <QuantityInput
        label={t('amount')}
        description={t('depositHint', {
          percent: capPercent,
          max: formatWhole(handCap, locale),
        })}
        value={amount}
        onChange={setAmount}
        grow
        onMax={() => setAmount(maxDeposit)}
        maxAriaLabel={t('depositMaxAria')}
        error={error}
      />
      {hall && (
        <Stack gap={2} mt="sm" aria-live="polite">
          <Text size="sm" c={noSlots ? 'red' : 'var(--ot-muted)'}>
            {t('depositSlots', {
              left: slotsLeft,
              limit: hall.deposits.limit,
              level: levelName,
            })}
          </Text>
          {noSlots && hall.deposits.nextSlotAt && (
            <Text size="sm" c="red">
              {t('depositNextSlot', {
                time: new Date(hall.deposits.nextSlotAt).toLocaleString(
                  i18n.language,
                  { dateStyle: 'short', timeStyle: 'short' },
                ),
              })}
            </Text>
          )}
          <Text size="sm" c={room === 0n ? 'red' : 'var(--ot-muted)'}>
            {t('depositRoom', {
              room: formatWhole(room, locale),
              cap: formatWhole(level.treasuryCap, locale),
            })}
          </Text>
          <Anchor
            component={Link}
            href={allianceUpgradesHref(allianceId)}
            scroll={false}
            size="sm"
          >
            {t('depositRaiseLimits')}
          </Anchor>
        </Stack>
      )}
      <Button
        fullWidth
        mt="md"
        type="button"
        onClick={submit}
        loading={loading}
        disabled={amount <= 0n || overHand || overRoom || noSlots}
      >
        {t('depositButton')}
      </Button>
    </GameCard>
  );
};
