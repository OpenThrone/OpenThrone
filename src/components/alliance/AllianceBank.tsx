import { Box, Grid, Group, Table, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import { transactionTypeLabel } from '@/components/alliance/allianceLabels';
import { getAllianceStanding } from '@/components/alliance/allianceStanding';
import { DepositForm } from '@/components/alliance/treasury/DepositForm';
import { GoldRequestForm } from '@/components/alliance/treasury/GoldRequestForm';
import { GoldRequestQueue } from '@/components/alliance/treasury/GoldRequestQueue';
import { LoanSection } from '@/components/alliance/treasury/LoanSection';
import { TransferForm } from '@/components/alliance/treasury/TransferForm';
import { GameCard } from '@/components/game/GameCard';
import { PageLoading } from '@/components/game/PageLoading';
import panelClasses from '@/components/game/Panels.module.css';
import { StyledTable } from '@/components/game/StyledTable';
import { useUser } from '@/context/users';
import type { AllianceInfo } from '@/services/Alliance.service';
import type { Locales } from '@/types/typings';
import { formatGold } from '@/utils/numberFormatting';

interface AllianceBankProps {
  alliance: AllianceInfo;
  onUpdate?: () => void;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/** Alliance bank. */
export const AllianceBank = ({ alliance, onUpdate }: AllianceBankProps) => {
  const { t, i18n } = useTranslation('alliances');
  const { user } = useUser();
  const locale = user?.locale ?? (i18n.language as Locales);
  const [requestsKey, setRequestsKey] = useState(0);

  const standing = getAllianceStanding(alliance, user?.id ?? null);
  const canManageBank = standing.can('manage_bank');
  const canRequestGold = standing.can('request_gold');

  const { data: history, mutate: reloadHistory } = useSWR(
    `/api/alliances/bank/history?allianceId=${alliance.id}`,
    fetcher,
  );

  const refresh = () => {
    reloadHistory();
    setRequestsKey((key) => key + 1);
    if (onUpdate) onUpdate(); // Update alliance balance
  };

  return (
    <Grid>
      <Grid.Col span={12}>
        <Box className={panelClasses.insetRow} p="md">
          <Group justify="space-between">
            <Text size="lg" fw={700} c="var(--ot-muted)">
              {t('bank.totalBalance', 'Total Alliance Treasury')}
            </Text>
            <Text size="xl" fw={700} c="var(--ot-heading)">
              {t('currency.goldAmount', {
                ns: 'common',
                amount: formatGold(alliance.gold_in_bank, locale),
              })}
            </Text>
          </Group>
        </Box>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 6 }}>
        <DepositForm allianceId={alliance.id} onDone={refresh} />
      </Grid.Col>

      {canManageBank && (
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TransferForm alliance={alliance} onDone={refresh} />
        </Grid.Col>
      )}

      {canRequestGold && (
        <Grid.Col span={{ base: 12, md: 6 }}>
          <GoldRequestForm allianceId={alliance.id} onDone={refresh} />
        </Grid.Col>
      )}

      {(canManageBank || canRequestGold) && (
        <Grid.Col span={12}>
          <GoldRequestQueue
            allianceId={alliance.id}
            onChanged={refresh}
            refreshKey={requestsKey}
          />
        </Grid.Col>
      )}

      {(canManageBank || canRequestGold) && (
        <Grid.Col span={12}>
          <LoanSection
            allianceId={alliance.id}
            onChanged={refresh}
            refreshKey={requestsKey}
          />
        </Grid.Col>
      )}

      <Grid.Col span={12}>
        <GameCard title={t('bank.historyTitle', 'Transaction History')}>
          {!history ? (
            <PageLoading block={false} />
          ) : (
            <StyledTable
              ariaLabel={t('bank.historyTitle', 'Transaction History')}
              headers={[
                t('bank.date', 'Date'),
                t('bank.user', 'User'),
                t('bank.type', 'Type'),
                t('bank.amount', 'Amount'),
              ]}
            >
              {history.map((entry: any) => (
                <Table.Tr key={entry.id}>
                  <Table.Td>
                    {new Date(entry.created_at).toLocaleString(locale)}
                  </Table.Td>
                  <Table.Td>
                    {entry.performed_by_user?.display_name ||
                      t('bank.unknownUser', 'Unknown')}
                  </Table.Td>
                  <Table.Td>
                    <Text
                      c={
                        ['DEPOSIT', 'LOAN_REPAYMENT'].includes(
                          entry.transaction_type,
                        )
                          ? 'green'
                          : 'red'
                      }
                      fw={500}
                    >
                      {transactionTypeLabel(t, entry.transaction_type)}
                    </Text>
                  </Table.Td>
                  <Table.Td>{formatGold(entry.amount, locale)}</Table.Td>
                </Table.Tr>
              ))}
              {history.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={4} align="center">
                    <Text c="dimmed">
                      {t('bank.noTransactions', 'No transactions found')}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </StyledTable>
          )}
        </GameCard>
      </Grid.Col>
    </Grid>
  );
};
