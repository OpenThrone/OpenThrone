import { Button, NumberInput, Select, TextInput } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';

import { allianceRequest } from '@/components/alliance/allianceStanding';
import { GameCard } from '@/components/game/GameCard';
import {
  ALLIANCE_NOTE_MAX_LENGTH,
  MEMBER_DAILY_CAP_DEFAULT,
} from '@/constants/allianceTreasury';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { AllianceInfo } from '@/services/Alliance.service';
import { toBigIntSafe } from '@/utils/jsonHelpers';
import { toLocale } from '@/utils/numberFormatting';

interface TransferFormProps {
  alliance: AllianceInfo;
  onDone: () => void;
}

/** Transfer treasury gold to a member (leader or manage_bank). */
export const TransferForm = ({ alliance, onDone }: TransferFormProps) => {
  const { t } = useTranslation('allianceTreasury');
  const { forceUpdate } = useUser();
  const [targetId, setTargetId] = useState<string | null>(null);
  const [amount, setAmount] = useState<bigint>(0n);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const options = useMemo(
    () =>
      (alliance.members ?? []).map((m) => ({
        value: String(m.user_id),
        label: m.user.display_name,
      })),
    [alliance.members],
  );

  const submit = async () => {
    if (!targetId || amount <= 0n || loading) return;
    setLoading(true);
    try {
      await allianceRequest('/api/alliances/bank/transfer', {
        allianceId: alliance.id,
        targetUserId: Number(targetId),
        amount: amount.toString(),
        notes: notes.trim() || undefined,
      });
      alertService.success(t('transferSuccess'));
      setAmount(0n);
      setNotes('');
      forceUpdate();
      onDone();
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GameCard title={t('transferTitle')}>
      <Select
        label={t('transferMember')}
        placeholder={t('transferMemberPlaceholder')}
        data={options}
        value={targetId}
        onChange={setTargetId}
        searchable
      />
      <NumberInput
        mt="sm"
        label={t('amount')}
        description={t('transferDailyCap', {
          cap: toLocale(
            (alliance as unknown as { member_daily_cap?: string })
              .member_daily_cap ?? MEMBER_DAILY_CAP_DEFAULT,
          ),
        })}
        min={0}
        value={amount.toString()}
        onChange={(val) => setAmount(toBigIntSafe(val))}
        thousandSeparator=","
      />
      <TextInput
        mt="sm"
        label={t('transferNote')}
        description={t('transferNoteHint', { max: ALLIANCE_NOTE_MAX_LENGTH })}
        maxLength={ALLIANCE_NOTE_MAX_LENGTH}
        value={notes}
        onChange={(e) => setNotes(e.currentTarget.value)}
      />
      <Button
        fullWidth
        mt="md"
        type="button"
        onClick={submit}
        loading={loading}
        disabled={!targetId || amount <= 0n}
      >
        {t('transferButton')}
      </Button>
    </GameCard>
  );
};
