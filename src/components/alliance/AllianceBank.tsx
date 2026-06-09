import {
  Button,
  Center,
  Grid,
  Group,
  Loader,
  NumberInput,
  Paper,
  Table,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import useSWR from 'swr';

import { GameCard } from '@/components/game/GameCard';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { AllianceInfo } from '@/services/Alliance.service';
import { toLocale } from '@/utils/numberFormatting';

interface AllianceBankProps {
  alliance: AllianceInfo;
  isLeader: boolean;
  onUpdate?: () => void;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/** Alliance bank. */
export const AllianceBank = ({
  alliance,
  isLeader,
  onUpdate,
}: AllianceBankProps) => {
  const { t } = useTranslation('alliances');
  const { user, forceUpdate } = useUser();
  const [depositAmount, setDepositAmount] = useState<string | number>('');
  const [withdrawAmount, setWithdrawAmount] = useState<string | number>('');
  const [loading, setLoading] = useState(false);

  const { data: history, mutate: reloadHistory } = useSWR(
    `/api/alliances/bank/history?allianceId=${alliance.id}`,
    fetcher,
  );

  const handleDeposit = async () => {
    if (!depositAmount || Number(depositAmount) <= 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/alliances/bank/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `alliance-deposit-${alliance.id}-${depositAmount}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify({
          allianceId: alliance.id,
          amount: depositAmount.toString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alertService.success(t('bank.depositSuccess', 'Deposit successful!'));
      setDepositAmount('');
      forceUpdate(); // Update user gold
      reloadHistory(); // Update history
      if (onUpdate) onUpdate(); // Update alliance balance match
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || Number(withdrawAmount) <= 0) return;
    if (!user) return;

    setLoading(true);
    try {
      const res = await fetch('/api/alliances/bank/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `alliance-withdraw-${alliance.id}-${withdrawAmount}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify({
          allianceId: alliance.id,
          targetUserId: user.id, // Direct withdraw to self for now
          amount: withdrawAmount.toString(),
          notes: 'Withdrawal by Leader',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alertService.success(t('bank.withdrawSuccess', 'Withdrawal successful!'));
      setWithdrawAmount('');
      forceUpdate();
      reloadHistory();
      if (onUpdate) onUpdate();
    } catch (error: any) {
      alertService.error(error.message);
    } finally {
      setLoading(false);
    }
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
              {toLocale(alliance.gold_in_bank)} Gold
            </Text>
          </Group>
        </Paper>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 6 }}>
        <GameCard title={t('bank.depositTitle', 'Make a Deposit')}>
          <NumberInput
            label={t('bank.amount', 'Amount')}
            placeholder="0"
            min={1}
            value={depositAmount}
            onChange={setDepositAmount}
            thousandSeparator=","
          />
          <Button
            fullWidth
            mt="md"
            type="button"
            onClick={handleDeposit}
            loading={loading}
            disabled={!depositAmount}
          >
            {t('bank.depositButton', 'Deposit Gold')}
          </Button>
        </GameCard>
      </Grid.Col>

      {isLeader && (
        <Grid.Col span={{ base: 12, md: 6 }}>
          <GameCard title={t('bank.withdrawTitle', 'Make a Withdrawal')}>
            <NumberInput
              label={t('bank.amount', 'Amount')}
              placeholder="0"
              min={1}
              value={withdrawAmount}
              onChange={setWithdrawAmount}
              thousandSeparator=","
            />
            <Button
              fullWidth
              type="button"
              mt="md"
              color="red"
              onClick={handleWithdraw}
              loading={loading}
              disabled={!withdrawAmount}
            >
              {t('bank.withdrawButton', 'Withdraw Gold')}
            </Button>
          </GameCard>
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
                      {new Date(entry.created_at).toLocaleString()}
                    </Table.Td>
                    <Table.Td>
                      {entry.performed_by_user?.display_name || 'Unknown'}
                    </Table.Td>
                    <Table.Td>
                      <Text
                        c={
                          entry.transaction_type === 'DEPOSIT' ? 'green' : 'red'
                        }
                        fw={500}
                      >
                        {entry.transaction_type}
                      </Text>
                    </Table.Td>
                    <Table.Td>{toLocale(entry.amount)}</Table.Td>
                  </Table.Tr>
                ))}
                {history.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={4} align="center">
                      <Text c="dimmed">No transactions found</Text>
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
