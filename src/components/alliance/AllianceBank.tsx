import { Center, Grid, Group, Loader, Paper, Table, Text } from '@mantine/core';
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
import { useUser } from '@/context/users';
import type { AllianceInfo } from '@/services/Alliance.service';
import { toLocale } from '@/utils/numberFormatting';

interface AllianceBankProps {
  alliance: AllianceInfo;
  onUpdate?: () => void;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/** Alliance bank. */
export const AllianceBank = ({ alliance, onUpdate }: AllianceBankProps) => {
  const { t, i18n } = useTranslation('alliances');
  const { user } = useUser();
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
        <Paper p="md" radius="md" withBorder bg="dark.8">
          <Group justify="space-between">
            <Text size="lg" fw={700} c="dimmed">
              {t('bank.totalBalance', 'Total Alliance Treasury')}
            </Text>
            <Text size="xl" fw={700} c="yellow">
              {t('bank.goldAmount', '{{amount}} Gold', {
                amount: toLocale(alliance.gold_in_bank, user?.locale),
              })}
            </Text>
          </Group>
        </Paper>
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
            <Center p="xl">
              <Loader />
            </Center>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('bank.date', 'Date')}</Table.Th>
                  <Table.Th>{t('bank.user', 'User')}</Table.Th>
                  <Table.Th>{t('bank.type', 'Type')}</Table.Th>
                  <Table.Th>{t('bank.amount', 'Amount')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.map((entry: any) => (
                  <Table.Tr key={entry.id}>
                    <Table.Td>
                      {new Date(entry.created_at).toLocaleString(i18n.language)}
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
                    <Table.Td>{toLocale(entry.amount, user?.locale)}</Table.Td>
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
              </Table.Tbody>
            </Table>
          )}
        </GameCard>
      </Grid.Col>
    </Grid>
  );
};
