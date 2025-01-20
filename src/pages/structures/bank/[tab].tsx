import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import {
  Paper,
  Tabs,
  SimpleGrid,
  Text,
  Space,
  ThemeIcon,
  Flex,
  Divider,
  rem,
} from '@mantine/core';
import {
  BiCoinStack,
  BiMoney,
  BiSolidBank,
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
export default function Bank() {
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
          setDepositWithdrawHistory(data);
          setMessage('');
        })
        .catch((error) => {
          console.error('Error fetching bank history:', error);
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
            setFilteredBankHistory(data);
            setMessage('');
          })
          .catch((error) => {
            console.error('Error fetching bank history:', error);
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
        console.error('Error fetching deposits:', error);
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
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <div className="flex items-center justify-between">
            <Text size="lg" fw="bold" c="dimmed">
              Gold On Hand
            </Text>
            <ThemeIcon c="white">
              <BiCoinStack style={{ width: rem(15), height: rem(15) }} />
            </ThemeIcon>
          </div>
          <div className="flex items-end gap-2 mt-2">
            <Text>
              {parseInt(user?.gold?.toString() ?? '0').toLocaleString()}
            </Text>
          </div>
        </Paper>

        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <div className="flex items-center justify-between">
            <Text size="lg" fw="bold" c="dimmed">
              Banked Gold
            </Text>
            <ThemeIcon c="white">
              <BiSolidBank style={{ width: rem(15), height: rem(15) }} />
            </ThemeIcon>
          </div>
          <div className="flex items-end gap-2 mt-2">
            <Text>
              {parseInt(user?.goldInBank?.toString() ?? '0').toLocaleString()}
            </Text>
          </div>
        </Paper>

        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <div className="flex items-center justify-between">
            <Text size="lg" fw="bold" c="dimmed">
              Daily Deposits
            </Text>
            <ThemeIcon c="white">
              <BiMoney style={{ width: rem(15), height: rem(15) }} />
            </ThemeIcon>
          </div>
          <div className="flex items-end gap-2 mt-2">
            <Text>{depositsMax}</Text>
          </div>
        </Paper>

        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <div className="flex items-center justify-between">
            <Text size="lg" fw="bold" c="dimmed">
              Deposits Available
            </Text>
            <ThemeIcon c="white">
              <BiMoney style={{ width: rem(15), height: rem(15) }} />
            </ThemeIcon>
          </div>
          <div className="flex items-end gap-2 mt-2">
            <Text>{despositsAvailable}</Text>
          </div>
          {despositsAvailable < depositsMax && (
            <Text size="sm" c="dimmed">
              Next deposit available in {nextDepositAvailable.hours}:
              {nextDepositAvailable.minutes}
            </Text>
          )}
        </Paper>
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
        <div>
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
          />
        </div>
      )}

      {currentPage === 'economy' && (
        <Flex>
          {/* Workers Card */}
          <Paper className="w-1/2 rounded-lg p-6" shadow="md">
            <h3 className="text-xl font-semibold">Workers</h3>
            <Divider my="md" />
            <div className="space-y-2">
              <Flex justify="space-between">
                <Text size="md">Total Workers:</Text>
                <Text size="sm">{citizenUnit || 0}</Text>
              </Flex>
              <Text c="dimmed" size="sm">
                To increase your workforce, visit the training page.
              </Text>
              <Flex justify="space-between">
                <Text size="md">Gold Per Worker:</Text>
                <Text size="sm">
                  {user?.goldPerWorkerPerTurn.toLocaleString()} gold/turn
                </Text>
              </Flex>
              <Text c="dimmed" size="sm">
                Upgrade your economy structure to increase gold per worker.
              </Text>
            </div>
          </Paper>

          <Space w="md" />

          {/* Operations Card */}
          <Paper className="w-1/2 rounded-lg p-6" shadow="md">
            <h3 className="text-xl font-semibold">Operations</h3>
            <Divider my="md" />
            <div className="space-y-4">
              <div className="flex justify-between">
                <strong>Current Economy Upgrade:</strong>
                <span>
                  {
                    EconomyUpgrades.find(
                      (eu) => eu.index === user?.economyLevel
                    )?.name
                  }
                </span>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                This Upgrade increases bank deposits or gold per worker
              </div>
              <div className="flex justify-between">
                <strong>Fortification Gold Per Turn:</strong>
                <span>{user?.fortificationGoldPerTurn.toLocaleString()}</span>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                As fortification upgrades, fort gold per turn increases
              </div>
              <div className="flex justify-between">
                <strong>Worker Gold Per Turn:</strong>
                <span>{user?.workerGoldPerTurn.toLocaleString()}</span>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                Increase this by training more workers & upgrading economy
              </div>
              <div className="flex justify-between">
                <strong>Total Gold Per Turn: </strong>
                <span>{user?.goldPerTurn.toLocaleString()}</span>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                Includes workers, fort gold, and additional wealth bonus
              </div>
              <div className="flex justify-between">
                <strong>Daily Income:</strong>
                <span>
                  {(
                    (BigInt(user?.goldPerTurn?.toString() || '0') * BigInt(48)) ?? BigInt(0)
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          </Paper>
        </Flex>
      )}
    </MainArea>
  );
}
