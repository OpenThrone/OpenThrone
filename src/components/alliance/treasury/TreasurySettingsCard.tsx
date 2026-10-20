import {
  Button,
  NumberInput,
  Paper,
  SimpleGrid,
  Text,
  Title,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { allianceRequest } from '@/components/alliance/allianceStanding';
import {
  LOAN_INTEREST_PCT_DEFAULT,
  LOAN_INTEREST_PCT_MAX,
  LOAN_INTEREST_PCT_MIN,
  LOAN_TERM_DAYS_DEFAULT,
  LOAN_TERM_DAYS_MAX,
  LOAN_TERM_DAYS_MIN,
  MEMBER_DAILY_CAP_DEFAULT,
  MEMBER_DAILY_CAP_MAX,
  MEMBER_DAILY_CAP_MIN,
} from '@/constants/allianceTreasury';
import { alertService } from '@/services/Alert.service';
import type { AllianceInfo } from '@/services/Alliance.service';

interface TreasurySettingsCardProps {
  alliance: AllianceInfo;
  onUpdate?: () => void;
}

/** Leader-only loan terms and member daily cap. */
export const TreasurySettingsCard = ({
  alliance,
  onUpdate,
}: TreasurySettingsCardProps) => {
  const { t } = useTranslation('allianceTreasury');
  const stored = alliance as unknown as {
    loan_term_days?: number;
    loan_interest_pct?: number;
    member_daily_cap?: string | number;
  };
  const [termDays, setTermDays] = useState<number>(
    stored.loan_term_days ?? LOAN_TERM_DAYS_DEFAULT,
  );
  const [interest, setInterest] = useState<number>(
    stored.loan_interest_pct ?? LOAN_INTEREST_PCT_DEFAULT,
  );
  const [cap, setCap] = useState<number>(
    // Serialized BigInts arrive as strings with a trailing 'n'.
    Number(
      String(stored.member_daily_cap ?? MEMBER_DAILY_CAP_DEFAULT).replace(
        /n$/,
        '',
      ),
    ),
  );
  const [loading, setLoading] = useState(false);

  const valid =
    termDays >= LOAN_TERM_DAYS_MIN &&
    termDays <= LOAN_TERM_DAYS_MAX &&
    interest >= LOAN_INTEREST_PCT_MIN &&
    interest <= LOAN_INTEREST_PCT_MAX &&
    cap >= MEMBER_DAILY_CAP_MIN &&
    cap <= MEMBER_DAILY_CAP_MAX;

  const save = async () => {
    if (!valid || loading) return;
    setLoading(true);
    try {
      await allianceRequest('/api/alliances/settings/treasury', {
        allianceId: alliance.id,
        loan_term_days: termDays,
        loan_interest_pct: interest,
        member_daily_cap: String(cap),
      });
      alertService.success(t('settings.saved'));
      onUpdate?.();
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Title order={4} mb="xs">
        {t('settings.title')}
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        {t('settings.help')}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <NumberInput
          label={t('settings.termDays')}
          min={LOAN_TERM_DAYS_MIN}
          max={LOAN_TERM_DAYS_MAX}
          allowDecimal={false}
          value={termDays}
          onChange={(v) => setTermDays(Number(v))}
        />
        <NumberInput
          label={t('settings.interest')}
          min={LOAN_INTEREST_PCT_MIN}
          max={LOAN_INTEREST_PCT_MAX}
          allowDecimal={false}
          suffix="%"
          value={interest}
          onChange={(v) => setInterest(Number(v))}
        />
        <NumberInput
          label={t('settings.dailyCap')}
          description={t('settings.dailyCapHint')}
          min={MEMBER_DAILY_CAP_MIN}
          max={MEMBER_DAILY_CAP_MAX}
          allowDecimal={false}
          thousandSeparator=","
          value={cap}
          onChange={(v) => setCap(Number(v))}
        />
      </SimpleGrid>
      <Button
        mt="md"
        type="button"
        onClick={save}
        loading={loading}
        disabled={!valid}
      >
        {t('settings.save')}
      </Button>
    </Paper>
  );
};
