import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { Tabs, SimpleGrid, Space } from '@mantine/core';
import { BiCoinStack, BiLineChart, BiMoney, BiSolidBank, BiUserCircle } from 'react-icons/bi';
import { useUser } from '@/context/users';
import BankDepositWithdraw from '@/components/BankDepositWithdraw';
import BankHistoryFilters from '@/components/BankHistoryFilters';
import BankHistoryTable from '@/components/BankHistoryTable';
import { EconomyUpgrades } from '@/constants';
import { useLocalStorage } from '@mantine/hooks';
import { logError } from '@/utils/logger';
import { GameCard } from '@/components/game/GameCard';
import { StatGrid } from '@/components/game/StatGrid';
import toLocale from '@/utils/numberFormatting';
import { getTransactionType, getGoldTxSymbol } from '@/utils/utilities';
import MainArea from '@/components/MainArea';

const defaultFilters = {
  deposits: true, withdraws: true, war_spoils: true, transfers: true, sale: true,
  training: true, recruitment: true, economy: true, fortification: true, daily: true,
};

export default function Bank() {
  const tab = usePathname()?.split('/')[3] || 'deposit';
  const router = useRouter();
  const [filters, setFilters] = useLocalStorage({ key: 'bankHistoryFilters', defaultValue: defaultFilters });
  const { user, forceUpdate } = useUser();
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    if (!user) return;
    if (tab === 'history') {
      const queryParams = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, String(v)])), page: String(page), limit: String(limit) });
      fetch(`/api/bank/history?${queryParams.toString()}`)
        .then(res => res.json())
        .then(data => { setHistory(data.rows); setTotalPages(data.totalPages); })
        .catch(err => logError('Error fetching bank history:', err));
    }
  }, [tab, filters, user, page, limit]);

  const statItems = [
    { label: "Gold On Hand", value: toLocale(user?.gold, user?.locale), icon: <BiCoinStack size={18} /> },
    { label: "Banked Gold", value: toLocale(user?.goldInBank, user?.locale), icon: <BiSolidBank size={18} /> },
    { label: "Daily Deposits", value: user?.maximumBankDeposits ?? 0, icon: <BiMoney size={18} /> },
    {
      label: "Deposits Available",
      value: user?.depositsAvailable < (user?.maximumBankDeposits ?? 0)
        ? `${user?.depositsAvailable ?? 0} (Next in ${user?.nextDepositAvailable?.hours ?? 0}:${user?.nextDepositAvailable?.minutes ?? 0})`
        : user?.depositsAvailable ?? 0,
      icon: <BiMoney size={18} />,
    },
  ];

  return (
    <MainArea title="Bank">
      <StatGrid title="Bank Overview" stats={statItems} />
      <Space h="md" />
      <Tabs value={tab} onChange={(value) => router.push(`/structures/bank/${value}`)} variant="pills" color="yellow">
        <Tabs.List grow justify="center">
          <Tabs.Tab value="deposit">Deposit</Tabs.Tab>
          <Tabs.Tab value="history">History</Tabs.Tab>
          <Tabs.Tab value="economy">Economy</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Space h="md" />

      {tab === 'deposit' && <BankDepositWithdraw user={user} forceUpdate={forceUpdate} />}

      {tab === 'history' && (
        <GameCard title="Bank History" icon={<BiSolidBank size={16} />}>
          <BankHistoryFilters colorScheme={user?.colorScheme} filters={filters} setFilters={setFilters} />
          <BankHistoryTable
            bankHistory={history}
            user={user}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            getTransactionType={getTransactionType}
            getGoldTxSymbol={getGoldTxSymbol}
          />
        </GameCard>
      )}

      {tab === 'economy' && (
        <SimpleGrid cols={{base: 1, md: 2}} spacing="md">
          <GameCard title="Workers" icon={<BiUserCircle size={16} />}>
            <p>Total Workers: {user?.units.find(u => u.type === 'WORKER')?.quantity || 0}</p>
            <p>Gold Per Worker: {user?.goldPerWorkerPerTurn.toLocaleString()} gold/turn</p>
          </GameCard>
          <GameCard title="Operations" icon={<BiLineChart size={16} />}>
            <p>Current Upgrade: {EconomyUpgrades.find(eu => eu.index === user?.economyLevel)?.name}</p>
            <p>Fort Gold/Turn: {user?.fortificationGoldPerTurn.toLocaleString()}</p>
            <p>Worker Gold/Turn: {user?.workerGoldPerTurn.toLocaleString()}</p>
            <p>Total Gold/Turn: {user?.goldPerTurn.toLocaleString()}</p>
            <p>Daily Income: {(BigInt(user?.goldPerTurn.toString() || '0') * BigInt(48)).toLocaleString()}</p>
          </GameCard>
        </SimpleGrid>
      )}
    </MainArea>
  );
}
