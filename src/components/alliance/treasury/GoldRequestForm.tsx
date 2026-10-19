import { Button, NumberInput, TextInput } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { allianceRequest } from '@/components/alliance/allianceStanding';
import { GameCard } from '@/components/game/GameCard';
import {
  ALLIANCE_NOTE_MAX_LENGTH,
  MAX_PENDING_GOLD_REQUESTS,
} from '@/constants/allianceTreasury';
import { alertService } from '@/services/Alert.service';
import { toBigIntSafe } from '@/utils/jsonHelpers';

interface GoldRequestFormProps {
  allianceId: number;
  onDone: () => void;
}

/** Ask the alliance managers for gold from the treasury. */
export const GoldRequestForm = ({
  allianceId,
  onDone,
}: GoldRequestFormProps) => {
  const { t } = useTranslation('allianceTreasury');
  const [amount, setAmount] = useState<bigint>(0n);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (amount <= 0n || loading) return;
    setLoading(true);
    try {
      await allianceRequest('/api/alliances/bank/requests/create', {
        allianceId,
        amount: amount.toString(),
        reason: reason.trim() || undefined,
      });
      alertService.success(t('requestSuccess'));
      setAmount(0n);
      setReason('');
      onDone();
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GameCard title={t('requestTitle')}>
      <NumberInput
        label={t('amount')}
        description={t('requestLimit', { count: MAX_PENDING_GOLD_REQUESTS })}
        min={0}
        value={amount.toString()}
        onChange={(val) => setAmount(toBigIntSafe(val))}
        thousandSeparator=","
      />
      <TextInput
        mt="sm"
        label={t('requestReason')}
        maxLength={ALLIANCE_NOTE_MAX_LENGTH}
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
      />
      <Button
        fullWidth
        mt="md"
        type="button"
        onClick={submit}
        loading={loading}
        disabled={amount <= 0n}
      >
        {t('requestButton')}
      </Button>
    </GameCard>
  );
};
