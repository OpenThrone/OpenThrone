import { Button } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import QuantityInput from '@/components/battle/QuantityInput';
import { GameCard } from '@/components/game/GameCard';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import { DEPOSIT_CAP_PERCENT, getMaxDeposit } from '@/utils/bankLimits';
import { toBigIntSafe } from '@/utils/jsonHelpers';
import { toLocale } from '@/utils/numberFormatting';

interface DepositFormProps {
  allianceId: number;
  onDone: () => void;
}

/** Deposit into the treasury, capped like the personal bank deposit. */
export const DepositForm = ({ allianceId, onDone }: DepositFormProps) => {
  const { t } = useTranslation('allianceTreasury');
  const { user, forceUpdate } = useUser();
  const [amount, setAmount] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const maxDeposit = getMaxDeposit(toBigIntSafe(user?.gold));
  const overCap = amount > maxDeposit;

  const submit = async () => {
    if (amount <= 0n || overCap || loading) return;
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
      if (!res.ok) throw new Error(data.error);
      alertService.success(t('depositSuccess'));
      setAmount(0n);
      forceUpdate();
      onDone();
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GameCard title={t('depositTitle')}>
      <QuantityInput
        label={t('amount')}
        description={t('depositHint', {
          percent: DEPOSIT_CAP_PERCENT,
          max: toLocale(maxDeposit, user?.locale),
        })}
        value={amount}
        onChange={setAmount}
        grow
        onMax={() => setAmount(maxDeposit)}
        maxAriaLabel={t('depositMaxAria')}
        error={
          overCap
            ? t('depositOverCap', { percent: DEPOSIT_CAP_PERCENT })
            : undefined
        }
      />
      <Button
        fullWidth
        mt="md"
        type="button"
        onClick={submit}
        loading={loading}
        disabled={amount <= 0n || overCap}
      >
        {t('depositButton')}
      </Button>
    </GameCard>
  );
};
