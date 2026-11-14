import {
  Alert,
  Anchor,
  Button,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import type { TFunction } from 'i18next';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';

import { allianceRequest } from '@/components/alliance/allianceStanding';
import { GameCard } from '@/components/game/GameCard';
import panelClasses from '@/components/game/Panels.module.css';
import {
  ALLIANCE_DUES_ACTIVE_PERIODS,
  ALLIANCE_DUES_MAX,
  ALLIANCE_DUES_PERIODS,
  ALLIANCE_JOIN_FEE_MAX,
  type AllianceDuesPeriod,
  allianceDuesPeriodKey,
  allianceDuesSettingsHref,
  isAllianceDuesPeriod,
  toDuesBigInt,
  validateAllianceDuesSettingsDetailed,
} from '@/constants/allianceDues';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { Locales } from '@/types/typings';
import { allianceErrorText } from '@/utils/allianceErrorMessage';
import { formatWhole } from '@/utils/formatWhole';
import {
  wholeGoldInput,
  wholeGoldSeparators,
  wholeGoldValue,
} from '@/utils/wholeGoldInput';

/** GET /api/alliances/dues/status as the browser receives it (bigint strings). */
export interface AllianceDuesStatusView {
  allianceId: number;
  status: string;
  joinFee: string;
  duesAmount: string;
  duesPeriod: AllianceDuesPeriod;
  nextCollectionAt: string | null;
  member: {
    isLeader: boolean;
    arrears: string;
    paidThrough: string | null;
  } | null;
  canSetDues: boolean;
}

/** Public fee and dues terms, as stored on the alliance row. */
export interface AllianceDuesTerms {
  joinFee: bigint;
  duesAmount: bigint;
  duesPeriod: AllianceDuesPeriod;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load dues (${res.status})`);
  return res.json();
};

/** Shared fee and dues status for the Overview, Bank and Settings tabs. */
export const useAllianceDuesStatus = (allianceId: number | null) =>
  useSWR<AllianceDuesStatusView>(
    allianceId ? `/api/alliances/dues/status?allianceId=${allianceId}` : null,
    fetcher,
  );

/** Reads the fee and dues columns of a (serialized) alliance row. */
export const duesTermsOf = (alliance: {
  join_fee?: bigint | string | number | null;
  dues_amount?: bigint | string | number | null;
  dues_period?: string | null;
}): AllianceDuesTerms => ({
  joinFee: toDuesBigInt(alliance?.join_fee),
  duesAmount: toDuesBigInt(alliance?.dues_amount),
  duesPeriod: isAllianceDuesPeriod(alliance?.dues_period)
    ? alliance.dues_period
    : 'NONE',
});

export const hasDues = (terms: AllianceDuesTerms) =>
  terms.duesPeriod !== 'NONE' && terms.duesAmount > 0n;

const gold = (t: TFunction, amount: bigint, locale?: Locales) =>
  t('currency.goldAmount', {
    ns: 'common',
    amount: formatWhole(amount, locale),
  });

/** "500 gold daily" or "No dues". */
export const duesLabel = (
  t: TFunction,
  terms: AllianceDuesTerms,
  locale?: Locales,
) =>
  hasDues(terms)
    ? t('memberDues.amountPer', {
        amount: gold(t, terms.duesAmount, locale),
        period: t(allianceDuesPeriodKey(terms.duesPeriod)),
      })
    : t('memberDues.none');

/**
 * The sentence a player confirms before joining or accepting an invitation:
 * the fee taken now from gold on hand, and the dues that follow.
 */
export const joinTermsMessage = (
  t: TFunction,
  name: string,
  terms: AllianceDuesTerms,
  locale?: Locales,
) =>
  [
    terms.joinFee > 0n
      ? t('memberDues.confirmFee', {
          name,
          fee: gold(t, terms.joinFee, locale),
        })
      : t('memberDues.confirmNoFee', { name }),
    hasDues(terms)
      ? t('memberDues.confirmDues', { dues: duesLabel(t, terms, locale) })
      : '',
  ]
    .filter(Boolean)
    .join(' ');

/** One label/value line, in the Stats card style. */
const TermRow = ({ label, value }: { label: string; value: string }) => (
  <Group justify="space-between" mb="xs" wrap="nowrap" gap="sm">
    <Text c="dimmed" size="sm">
      {label}
    </Text>
    <Text fw={500} size="sm" ta="right">
      {value}
    </Text>
  </Group>
);

/** Compact fee and dues for people outside the alliance (header, cards). */
export const AllianceJoinTerms = ({
  terms,
  size = 'sm',
}: {
  terms: AllianceDuesTerms;
  size?: 'xs' | 'sm';
}) => {
  const { t, i18n } = useTranslation('alliances');
  const locale = i18n.language as Locales;
  return (
    <Text size={size} c="var(--ot-muted)">
      {t('memberDues.joinTerms', {
        fee:
          terms.joinFee > 0n
            ? gold(t, terms.joinFee, locale)
            : t('memberDues.noFee'),
        dues: duesLabel(t, terms, locale),
      })}
    </Text>
  );
};

interface AllianceDuesCardProps {
  allianceId: number;
  /** Refresh the alliance (treasury) after a payment. */
  onPaid?: () => void;
  /** Mock status for the /test guide; skips the request. */
  mockStatus?: AllianceDuesStatusView;
  /** /test guide: Pay dues calls this instead of the API. */
  mockPay?: () => void;
}

/**
 * Fee and dues for members (Overview and Bank tabs): the fee, the dues and
 * period, the next collection, what the viewer owes with a Pay dues button,
 * and where the leader changes it (section 17 visibility).
 */
export const AllianceDuesCard = ({
  allianceId,
  onPaid,
  mockStatus,
  mockPay,
}: AllianceDuesCardProps) => {
  const { t, i18n } = useTranslation('alliances');
  const { user, forceUpdate } = useUser();
  const locale = i18n.language as Locales;
  const live = useAllianceDuesStatus(mockStatus ? null : allianceId);
  const status = mockStatus ?? live.data;
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState<number | '' | null>(null);

  const arrears = toDuesBigInt(status?.member?.arrears);
  useEffect(() => {
    setAmount(null);
  }, [status?.member?.arrears]);

  if (!status) {
    return (
      <GameCard title={t('memberDues.title')}>
        <Text size="sm" c="dimmed">
          {live.error ? t('memberDues.loadError') : t('memberDues.loading')}
        </Text>
      </GameCard>
    );
  }

  const terms: AllianceDuesTerms = {
    joinFee: toDuesBigInt(status.joinFee),
    duesAmount: toDuesBigInt(status.duesAmount),
    duesPeriod: status.duesPeriod,
  };
  // Default to what the member can pay now: the arrears or the gold on hand.
  const onHand = user?.gold != null ? toDuesBigInt(user.gold) : arrears;
  const payAmount =
    amount === ''
      ? 0
      : (amount ?? Number(onHand > 0n && onHand < arrears ? onHand : arrears));
  const valid = payAmount >= 1 && BigInt(payAmount) <= arrears;

  const pay = async () => {
    if (!valid || paying) return;
    if (mockStatus) {
      mockPay?.();
      return;
    }
    setPaying(true);
    try {
      const result = await allianceRequest('/api/alliances/dues/pay', {
        allianceId,
        amount: payAmount,
      });
      alertService.success(
        t('memberDues.paid', {
          amount: gold(t, toDuesBigInt(result?.paid), locale),
        }),
      );
      await live.mutate();
      forceUpdate?.();
      onPaid?.();
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <GameCard title={t('memberDues.title')}>
      <TermRow
        label={t('memberDues.joinFee')}
        value={
          terms.joinFee > 0n
            ? gold(t, terms.joinFee, locale)
            : t('memberDues.noFee')
        }
      />
      <TermRow
        label={t('memberDues.dues')}
        value={duesLabel(t, terms, locale)}
      />
      {status.nextCollectionAt && (
        <TermRow
          label={t('memberDues.nextCollection')}
          value={new Date(status.nextCollectionAt).toLocaleString(locale, {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        />
      )}
      {status.member &&
        (status.member.isLeader ? (
          <Text size="xs" c="var(--ot-muted)" mb="xs">
            {t('memberDues.leaderExempt')}
          </Text>
        ) : (
          <TermRow
            label={t('memberDues.youOwe')}
            value={gold(t, arrears, locale)}
          />
        ))}
      {status.member && !status.member.isLeader && arrears > 0n && (
        <Stack gap="xs" mt="xs">
          <Text size="xs" c="var(--ot-muted)">
            {t('memberDues.arrearsHelp')}
          </Text>
          <Group align="end" gap="xs" wrap="nowrap">
            <NumberInput
              aria-label={t('memberDues.payAmount')}
              min={1}
              max={Number(arrears)}
              allowDecimal={false}
              allowNegative={false}
              {...wholeGoldSeparators(locale)}
              value={amount === '' ? '' : payAmount}
              onChange={(v) => setAmount(wholeGoldInput(v))}
              style={{ flex: 1 }}
              error={!valid ? t('memberDues.payInvalid') : undefined}
            />
            <Button onClick={pay} loading={paying} disabled={!valid}>
              {t('memberDues.pay')}
            </Button>
          </Group>
        </Stack>
      )}
      {status.canSetDues ? (
        <Text size="xs" c="var(--ot-muted)" mt="sm">
          {t('memberDues.whereSetter')}{' '}
          <Anchor
            component={Link}
            href={allianceDuesSettingsHref(allianceId)}
            scroll={false}
            size="xs"
          >
            {t('memberDues.settingsLink')}
          </Anchor>
        </Text>
      ) : (
        <Text size="xs" c="var(--ot-muted)" mt="sm">
          {t('memberDues.whereMember')}
        </Text>
      )}
    </GameCard>
  );
};

interface AllianceDuesSettingsCardProps {
  allianceId: number;
  terms: AllianceDuesTerms;
  onSaved?: () => void;
  /** /test guide: never reaches the API. */
  mockAction?: (values: AllianceDuesTerms) => void;
}

/**
 * Leader and set_dues holders set the join fee and dues on the Settings tab.
 * Lists the maximum for each period so the limits are visible where they
 * are set.
 */
export const AllianceDuesSettingsCard = ({
  allianceId,
  terms,
  onSaved,
  mockAction,
}: AllianceDuesSettingsCardProps) => {
  const { t, i18n } = useTranslation('alliances');
  const locale = i18n.language as Locales;
  const [joinFee, setJoinFee] = useState<number | ''>(Number(terms.joinFee));
  const [duesAmount, setDuesAmount] = useState<number | ''>(
    Number(terms.duesAmount),
  );
  const [duesPeriod, setDuesPeriod] = useState<AllianceDuesPeriod>(
    terms.duesPeriod,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  useEffect(() => {
    setJoinFee(Number(terms.joinFee));
    setDuesAmount(Number(terms.duesAmount));
    setDuesPeriod(terms.duesPeriod);
  }, [terms.joinFee, terms.duesAmount, terms.duesPeriod]);

  const values: AllianceDuesTerms = {
    joinFee: BigInt(wholeGoldValue(joinFee)),
    duesAmount: BigInt(wholeGoldValue(duesAmount)),
    duesPeriod,
  };
  const refusalDetail = validateAllianceDuesSettingsDetailed(values);
  const refusal = refusalDetail ? allianceErrorText(refusalDetail, t) : null;
  const changed =
    values.joinFee !== terms.joinFee ||
    values.duesAmount !== terms.duesAmount ||
    values.duesPeriod !== terms.duesPeriod;
  const periodMax = duesPeriod === 'NONE' ? 0n : ALLIANCE_DUES_MAX[duesPeriod];
  const errorId = `alliance-dues-error-${allianceId}`;

  const save = async () => {
    if (saving || !changed || refusal) return;
    setSaving(true);
    setError(null);
    try {
      if (mockAction) {
        mockAction(values);
      } else {
        await allianceRequest('/api/alliances/dues/settings', {
          allianceId,
          joinFee: Number(values.joinFee),
          duesAmount: Number(values.duesAmount),
          duesPeriod: values.duesPeriod,
        });
      }
      alertService.success(t('memberDues.saved'));
      if (!mockAction)
        await mutate(`/api/alliances/dues/status?allianceId=${allianceId}`);
      onSaved?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const shownError = error ?? (changed ? refusal : null);

  return (
    <GameCard title={t('memberDues.settingsTitle')}>
      <Text size="sm" c="dimmed" mb="md">
        {t('memberDues.settingsHelp')}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <NumberInput
          label={t('memberDues.joinFee')}
          description={t('memberDues.maxValue', {
            max: gold(t, ALLIANCE_JOIN_FEE_MAX, locale),
          })}
          min={0}
          max={Number(ALLIANCE_JOIN_FEE_MAX)}
          allowDecimal={false}
          allowNegative={false}
          {...wholeGoldSeparators(locale)}
          value={joinFee}
          onChange={(v) => setJoinFee(wholeGoldInput(v))}
          aria-describedby={shownError ? errorId : undefined}
        />
        <Select
          label={t('memberDues.period.label')}
          data={ALLIANCE_DUES_PERIODS.map((period) => ({
            value: period,
            label: t(`memberDues.periodOption.${period}`),
          }))}
          value={duesPeriod}
          allowDeselect={false}
          onChange={(v) => {
            if (!isAllianceDuesPeriod(v)) return;
            setDuesPeriod(v);
            if (v === 'NONE') setDuesAmount(0);
          }}
        />
        <NumberInput
          label={t('memberDues.duesPerMember')}
          description={
            duesPeriod === 'NONE'
              ? t('memberDues.choosePeriod')
              : t('memberDues.maxValue', { max: gold(t, periodMax, locale) })
          }
          min={0}
          max={Number(periodMax)}
          disabled={duesPeriod === 'NONE'}
          allowDecimal={false}
          allowNegative={false}
          {...wholeGoldSeparators(locale)}
          value={duesAmount}
          onChange={(v) => setDuesAmount(wholeGoldInput(v))}
          aria-describedby={shownError ? errorId : undefined}
        />
      </SimpleGrid>
      {shownError && (
        <Alert color="red" mt="sm" role="alert" id={errorId}>
          {shownError}
        </Alert>
      )}
      <Table
        mt="md"
        className={panelClasses.insetRow}
        aria-label={t('memberDues.maxTitle')}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('memberDues.period.label')}</Table.Th>
            <Table.Th ta="right">{t('memberDues.maxPerMember')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {ALLIANCE_DUES_ACTIVE_PERIODS.map((period) => (
            <Table.Tr key={period}>
              <Table.Td>{t(`memberDues.periodOption.${period}`)}</Table.Td>
              <Table.Td ta="right">
                {gold(t, ALLIANCE_DUES_MAX[period], locale)}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="xs" c="var(--ot-muted)" mt="xs">
        {t('memberDues.settingsFootnote')}
      </Text>
      <Button
        mt="md"
        type="button"
        onClick={save}
        loading={saving}
        disabled={!changed || !!refusal}
      >
        {t('memberDues.save')}
      </Button>
    </GameCard>
  );
};
