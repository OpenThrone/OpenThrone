import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import {
  Tabs,
  SimpleGrid,
  Text,
  Space,
  Flex,
  rem,
} from '@mantine/core';
import {
  BiCoinStack,
  BiLineChart,
  BiMoney,
  BiSolidBank,
  BiUserCircle,
} from 'react-icons/bi';

import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import classes from './[tab].module.css'; // Keep your styling

// Sub-components
import BankDepositWithdraw from '@/components/BankDepositWithdraw';
import BankHistoryFilters from '@/components/BankHistoryFilters';
import BankHistoryTable from '@/components/BankHistoryTable';
import { EconomyUpgrades } from '@/constants';
import { useLocalStorage } from '@mantine/hooks';
import { logError } from '@/utils/logger';
import BankCard from '@/components/StatCard';
import ContentCard from '@/components/ContentCard';

const defaultFilters = {
  deposits: true,
  withdraws: true,
  war_spoils: true,
  transfers: true,
  sale: true,
  training: true,
  recruitment: true,
  economy: true,
  fortification: true,
  daily: true,
};
export default function Bank(props) {
  const tab = usePathname()?.split('/')[3];
  const router = useRouter();
  const [filters, setFilters] = useLocalStorage({
    key: 'bankHistoryFilters',
    defaultValue: defaultFilters,
  });
  const { user, forceUpdate } = useUser();
  const currentPage = tab || 'deposit';

  // State relevant to deposit & withdraw
  // 1) Separate state for deposit/withdraw limited history:
  const [depositWithdrawHistory, setDepositWithdrawHistory] = useState([]);
  // 2) Separate state for the *filtered* history tab:
  const [filteredBankHistory, setFilteredBankHistory] = useState([]);
  const [despositsAvailable, setDepositsAvailable] = useState(0);
  const [depositsMax, setDepositsMax] = useState(0);
  const [nextDepositAvailable, setNextDepositAvailable] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [message, setMessage] = useState('');
  const [colorScheme, setColorScheme] = useState('ELF');
  const [citizenUnit, setCitizenUnit] = useState(0);
  const searchParams = useSearchParams();
  const page = Number(searchParams.get('page')) || 0; //todo add pagination
  const limit = Number(searchParams.get('limit')) || 10;
  const [totalPages, setTotalPages] = useState(0);

  function handleRowsPerPageChange(option: number): void {
    router.push(`/structures/bank/history?page=0&limit=${option}`);
  }

  const getTransactionType = (entry) => {
    const { from_user_id, to_user_id, from_user_account_type, history_type, stats } = entry;
    if (from_user_id === to_user_id) {
      if (from_user_account_type === 'HAND') {
        if (history_type === 'SALE') return 'Purchase';
        return stats?.type === 'CONVERT' ? 'Unit Conversion' : 'Deposit';
      }
      return history_type === 'SALE' ? 'Sale' : 'Withdraw';
    }
    if (history_type === 'SALE') {
      switch (stats?.type) {
        case 'TRAINING_UNTRAIN':
          return 'Untrain Units';
        case 'TRAINING_TRAIN':
          return 'Train Units';
        case 'TRAINING_CONVERSION':
          return 'Convert Units';
        case 'BATTLE_UPGRADES_BUY':
          return 'Battle Upgrade Purchase';
        case 'BATTLE_UPGRADES_SELL':
          return 'Battle Upgrade Sale';
      }
    }
    if (history_type === 'PLAYER_TRANSFER') return 'Player Transfer';
    if (history_type === 'RECRUITMENT') return 'Recruitment';
    if (history_type === 'ECONOMY') return 'Income';
    if (history_type === 'FORT_REPAIR') return 'Fort Repair';
    if (history_type === 'WAR_SPOILS') return 'War Spoils';
    if (history_type === 'DAILY_RECRUIT') return 'Daily Reward';
    return 'UNKNOWN';
  };

  const getGoldTxSymbol = (entry) => {
    const transactionType = getTransactionType(entry);
    if (transactionType === 'Recruitment' || transactionType === 'Income') return '+';
    if (transactionType === 'War Spoils' && entry.to_user_id === user?.id) return '+';
    return '-';
  };

  // Fetch user color scheme
  useEffect(() => {
    if (user && user.colorScheme) {
      setColorScheme(user.colorScheme);
    }
  }, [user]);

  // On mount or whenever "currentPage" or filters change, fetch data
  useEffect(() => {
    if (!user) return;

    const anyFilterActive = Object.values(filters).some((status) => status === true);

    // Only fetch history for the deposit or history pages
    if (currentPage === 'deposit')
    {
      fetch('/api/bank/history?deposits=true&withdraws=true&limit=10&page=0')
        .then((response) => response.json())
        .then((data) => {
          setDepositWithdrawHistory(data.rows);
          setMessage('');
        })
        .catch((error) => {
          logError('Error fetching bank history:', error);
          setMessage('Failed to fetch data');
        });
    }
    if (currentPage === 'history') {
      if (anyFilterActive) {
        const queryParams = new URLSearchParams();
        Object.keys(filters).forEach((key) => {
          if (filters[key]) {
            queryParams.append(key, 'true');
          }
        });

        queryParams.set('page', page.toString());
        queryParams.set('limit', limit.toString());

        fetch(`/api/bank/history?${queryParams.toString()}`)
          .then((response) => response.json())
          .then((data) => {
            setFilteredBankHistory(data.rows);
            setTotalPages(data.totalPages);
            setMessage('');
          })
          .catch((error) => {
            logError('Error fetching bank history:', error);
            setMessage('Failed to fetch data');
          });
      } else {
        setMessage('No filters selected');
        setFilteredBankHistory([]);
      }
    }

    // Always fetch deposit availability
    fetch('/api/bank/getDeposits')
      .then((response) => response.json())
      .then((data) => {
        setDepositsAvailable(data.deposits);
        setNextDepositAvailable(data.nextDepositAvailable);
        setDepositsMax(user?.maximumBankDeposits || 0);
        setMessage('');
      })
      .catch((error) => {
        logError('Error fetching deposits:', error);
        setMessage('Failed to fetch deposits');
      });
  }, [currentPage, filters, user, page, limit]);

  useEffect(() => {
    if (user?.units) {
      setCitizenUnit(user.units.find((u) => u.type === 'WORKER')?.quantity ?? 0);
    }
  }, [user]);

  return (
    <MainArea title="Bank">
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} gap="lg" verticalgap="xl">
        {/* Gold On Hand Card */}
        <BankCard
          title="Gold On Hand"
          value={parseInt(user?.gold?.toString() ?? '0')}
          icon={<BiCoinStack style={{ width: rem(15), height: rem(15) }} />}
          variant="default"
        />

        {/* Banked Gold Card */}
        <BankCard
          title="Banked Gold"
          value={parseInt(user?.goldInBank?.toString() ?? '0')}
          icon={<BiSolidBank style={{ width: rem(15), height: rem(15) }} />}
          variant="default"
        />

        {/* Daily Deposits Card */}
        <BankCard
          title="Daily Deposits"
          value={depositsMax}
          icon={<BiMoney style={{ width: rem(15), height: rem(15) }} />}
          variant="default"
        />

        {/* Deposits Available Card */}
        <BankCard
          title="Deposits Available"
          value={despositsAvailable}
          icon={<BiMoney style={{ width: rem(15), height: rem(15) }} />}
          variant={despositsAvailable > 0 ? "pulse" : "default"}
          subtext={despositsAvailable < depositsMax ? 
            `Next deposit available in ${nextDepositAvailable.hours}:${nextDepositAvailable.minutes}` : 
            undefined}
        />
      </SimpleGrid>

      <Space h="md" />

      {/* Tabs: deposit, history, economy */}
      <Tabs
        defaultValue={currentPage}
        className="mb-2 font-medieval"
      >
        <Tabs.List grow justify="center">
          <Tabs.Tab
            value="deposit"
            onClick={() => {
              router.push('/structures/bank/deposit');
            }}
            color={
              colorScheme === 'ELF'
                ? 'green'
                : colorScheme === 'GOBLIN'
                  ? 'red'
                  : colorScheme === 'UNDEAD'
                    ? 'dark'
                    : 'blue'
            }
          >
            <span className="text-xl">Deposit</span>
          </Tabs.Tab>
          <Tabs.Tab
            value="history"
            onClick={() => {
              router.push('/structures/bank/history');
            }}
            color={
              colorScheme === 'ELF'
                ? 'green'
                : colorScheme === 'GOBLIN'
                  ? 'red'
                  : colorScheme === 'UNDEAD'
                    ? 'dark'
                    : 'blue'
            }
          >
            <span className="text-xl">History</span>
          </Tabs.Tab>
          <Tabs.Tab
            value="economy"
            onClick={() => {
              router.push('/structures/bank/economy');
            }}
            color={
              colorScheme === 'ELF'
                ? 'green'
                : colorScheme === 'GOBLIN'
                  ? 'red'
                  : colorScheme === 'UNDEAD'
                    ? 'dark'
                    : 'blue'
            }
          >
            <span className="text-xl">Economy</span>
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      <Space h="md" />

      {currentPage === 'deposit' && (
        <BankDepositWithdraw
          user={user}
          forceUpdate={forceUpdate}
          bankHistory={depositWithdrawHistory}
          setDepositsAvailable={setDepositsAvailable}
          setNextDepositAvailable={setNextDepositAvailable}
          colorScheme={colorScheme}
        />
      )}

      {currentPage === 'history' && (
        <ContentCard
        title="Bank History"
        icon={<BiSolidBank style={{ width: rem(15), height: rem(15) }} />}
        >
          {/* Filters */}
          <BankHistoryFilters
            colorScheme={colorScheme}
            setFilters={setFilters}
            filters={filters}
          />

          {/* Full Table */}
          <BankHistoryTable
            bankHistory={filteredBankHistory}
            user={user}
            message={message}
            getTransactionType={getTransactionType}
            getGoldTxSymbol={getGoldTxSymbol}
            handleRowsPerPageChange={handleRowsPerPageChange}
            limit={limit}
            page={page}
            totalPages={totalPages}
          />
        </ContentCard>
      )}

      {currentPage === 'economy' && (
        <Flex gap="md" direction={{ base: 'column', sm: 'row' }}>
          {/* Workers Card */}
          <ContentCard 
            title="Workers"
            icon={<BiUserCircle style={{ width: rem(15), height: rem(15) }} />}
            className="flex-1"
          >
            <div className="space-y-4">
              <div>
                <Flex justify="space-between" align="center" mb={8}>
                  <Text fw={500}>Total Workers:</Text>
                  <Text>{citizenUnit || 0}</Text>
                </Flex>
                <Text c="dimmed" size="sm">
                  To increase your workforce, visit the training page.
                </Text>
              </div>
              
              <div>
                <Flex justify="space-between" align="center" mb={8}>
                  <Text fw={500}>Gold Per Worker:</Text>
                  <Text>{user?.goldPerWorkerPerTurn.toLocaleString()} gold/turn</Text>
                </Flex>
                <Text c="dimmed" size="sm">
                  Upgrade your economy structure to increase gold per worker.
                </Text>
              </div>
            </div>
          </ContentCard>

          {/* Operations Card */}
          <ContentCard 
            title="Operations"
            icon={<BiLineChart style={{ width: rem(15), height: rem(15) }} />}
            className="flex-1"
          >
            <div className="space-y-4">
              <div>
                <Flex justify="space-between" align="center" mb={8}>
                  <Text fw={500}>Current Economy Upgrade:</Text>
                  <Text>
                    {EconomyUpgrades.find((eu) => eu.index === user?.economyLevel)?.name}
                  </Text>
                </Flex>
                <Text c="dimmed" size="sm">
                  This Upgrade increases bank deposits or gold per worker
                </Text>
              </div>
              
              <div>
                <Flex justify="space-between" align="center" mb={8}>
                  <Text fw={500}>Fortification Gold Per Turn:</Text>
                  <Text>{user?.fortificationGoldPerTurn.toLocaleString()}</Text>
                </Flex>
                <Text c="dimmed" size="sm">
                  As fortification upgrades, fort gold per turn increases
                </Text>
              </div>
              
              <div>
                <Flex justify="space-between" align="center" mb={8}>
                  <Text fw={500}>Worker Gold Per Turn:</Text>
                  <Text>{user?.workerGoldPerTurn.toLocaleString()}</Text>
                </Flex>
                <Text c="dimmed" size="sm">
                  Increase this by training more workers & upgrading economy
                </Text>
              </div>
              
              <div>
                <Flex justify="space-between" align="center" mb={8}>
                  <Text fw={500}>Total Gold Per Turn:</Text>
                  <Text>{user?.goldPerTurn.toLocaleString()}</Text>
                </Flex>
                <Text c="dimmed" size="sm">
                  Includes workers, fort gold, and additional wealth bonus
                </Text>
              </div>
              
              <div>
                <Flex justify="space-between" align="center" mb={8}>
                  <Text fw={500}>Daily Income:</Text>
                  <Text>
                    {((BigInt(user?.goldPerTurn?.toString() || '0') * BigInt(48)) ?? BigInt(0)).toLocaleString()}
                  </Text>
                </Flex>
                <Text c="dimmed" size="sm">
                  Based on 48 turns per day
                </Text>
              </div>
            </div>
          </ContentCard>
        </Flex>
      )}
    </MainArea>
  );
}
