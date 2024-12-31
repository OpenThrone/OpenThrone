import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

import { alertService } from '@/services';
import { useUser } from '@/context/users';
import toLocale, { stringifyObj } from '@/utils/numberFormatting';
import { Chip, Group, Paper, Table, Tabs, SimpleGrid, Text, Space, NumberInput, rem, ThemeIcon, Button, Flex, Divider } from '@mantine/core';
import { BiCoinStack, BiMoney, BiMoneyWithdraw, BiSolidBank } from "react-icons/bi";
import classes from './[tab].module.css'
import { EconomyUpgrades } from '@/constants';
import MainArea from '@/components/MainArea';

const Bank = () => {
  const tab = usePathname()?.split('/')[3];
  const { user, forceUpdate } = useUser();
  const [depositAmount, setDepositAmount] = useState(BigInt(0));
  const [withdrawAmount, setWithdrawAmount] = useState(BigInt(0));
  const [bankHistory, setBankHistory] = useState([]);
  const currentPage = tab || 'deposit';
  const [citizenUnit, setCitizenUnit] = useState(0);
  const [despositsAvailable, setDepositsAvailable] = useState(0);
  const [depositsMax, setDepositsMax] = useState(0);
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [colorScheme, setColorScheme] = useState('ELF');
  const [nextDepositAvailable, setNextDepositAvailable] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [depositError, setDepositError] = useState('');
  const [withdrawError, setWithdrawError] = useState('');

  const [filters, setFilters] = useState({
    deposits: true,
    withdraws: true,
    war_spoils: true,
    transfers: true,
    sale: true,
    training: true,
    recruitment: true,
    economy: true,
  });

  useEffect(() => {
    if (user) {
      if (user.colorScheme)
        setColorScheme(user.colorScheme);
    }
  }, [user]);

  useEffect(() => {
    const anyFilterActive = Object.values(filters).some(status => status === true);

    if (currentPage === 'history' || currentPage === 'deposit') {
      if (anyFilterActive) {
        const queryParams = new URLSearchParams();
        Object.keys(filters).forEach(key => {
          if (filters[key]) {
            queryParams.append(key, 'true');
          }
        });

        fetch(`/api/bank/history?${queryParams.toString()}`)
          .then((response) => response.json())
          .then((data) => {
            setBankHistory(data);
            setMessage('');
          })
          .catch((error) => {
            console.error('Error fetching bank history:', error);
            setMessage('Failed to fetch data');
          });
      } else {
        setMessage('No filters selected');
        setBankHistory([]);
      }
    } 
      fetch('/api/bank/getDeposits')
        .then((response) => response.json())
        .then((data) => {
          setDepositsAvailable(data.deposits);
          setNextDepositAvailable(data.nextDepositAvailable);
          setMessage('');
        })
        .catch((error) => {
          console.error('Error fetching deposits:', error);
          setMessage('Failed to fetch deposits');
        });

  }, [currentPage, filters]);


  useEffect(() => {
    if(user && user.units){
      setCitizenUnit(user?.units.find((u) => u.type === 'WORKER')?.quantity ?? 0);
      setDepositsMax(user.maximumBankDeposits);
      if (depositAmount > BigInt(Math.floor(parseInt(user?.gold?.toString()) * 0.8))) {
        setDepositError('Deposit amount exceeds the maximum allowed limit.');
      } else {
        setDepositError('');
      }
      if (withdrawAmount > BigInt(user?.goldInBank?.toString())) {
        setWithdrawError('Withdraw amount exceeds the maximum allowed limit.');
      } else {
        setWithdrawError('');
      }
    }

  }, [user, depositAmount, withdrawAmount]);

  const handleDeposit = async () => {
    if (depositAmount > BigInt(Math.floor(parseInt(user?.gold?.toString()) * 0.8))) {
      setDepositError('Deposit amount exceeds the maximum allowed limit.');
      return;
    }
    setDepositError('')
    try {
      const response = await fetch('/api/bank/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stringifyObj({ depositAmount })),
      });

      const data = await response.json();

      if (data.error) {
        alertService.error(data.error);
      } else {
        // Update the user context or fetch new data
        forceUpdate();
        alertService.success("Successfully deposited gold");
        fetch('/api/bank/getDeposits')
          .then((response) => response.json())
          .then((data) => setDepositsAvailable(data.deposits))
          .catch((error) => console.error('Error fetching bank history:', error));
        setDepositAmount(BigInt(0));
        setDepositError('');
      }
    } catch (error) {
      console.error('Error depositing:', error);
      alertService.error('Failed to deposit gold. Please try again.');
    }
  };
  const handleWithdraw = async () => {
    if (withdrawAmount > BigInt(user?.goldInBank?.toString())) {
      setWithdrawError('Withdraw amount exceeds the maximum allowed limit.');
      return;
    }
    setWithdrawError('')
    try {
      const response = await fetch('/api/bank/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(stringifyObj({ withdrawAmount })),
      });

      const data = await response.json();

      if (data.error) {
        // Handle error
      } else {
        // Update the user context or fetch new data
        forceUpdate();
        alertService.success("Successfully withdrew gold");
        setWithdrawAmount(BigInt(0));
        setWithdrawError('');
      }
    } catch (error) {
      console.error('Error withdrawing:', error);
      alertService.error('Failed to withdraw gold. Please try again.');
    }
  };

  const getTransactionType = (entry) => {
    const { from_user_id, to_user_id, from_user_account_type, history_type, stats } = entry;

    // Handle cases where the user is both the sender and receiver
    if (from_user_id === to_user_id) {
      if (from_user_account_type === 'HAND') {
        if (history_type === 'SALE') return 'Purchase';
        return stats?.type === 'CONVERT' ? 'Unit Conversion' : 'Deposit';
      }
      return history_type === 'SALE' ? 'Sale' : 'Withdraw';
    }

    // Handle training-related transactions
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

    // Handle sales and equipment transactions
    if (history_type === 'SALE') {
      if (from_user_id === 0 && from_user_account_type === 'BANK') {
        return 'Sale';
      }
      if (from_user_account_type === 'HAND' && to_user_id === 0) {
        return stats?.type === 'ARMORY_EQUIP' ? 'Purchase' : 'Sale';
      }
    }

    // Handle player transfers
    if (history_type === 'PLAYER_TRANSFER') return 'Player Transfer';

    if (history_type === 'RECRUITMENT') return 'Recruitment';

    if (history_type === 'ECONOMY') return 'Income';

    if (history_type === 'WAR_SPOILS') return 'War Spoils';
    // Fallback for unknown types
    console.log('Unknown transaction type:', entry);
    return 'UNKNOWN';
  };

  const getGoldTxSymbol = (entry) => {
    let transactionType = '';
    transactionType = getTransactionType(entry);
    if (entry.stats.type?.includes(["UN"]))
      return '+';
    if (transactionType === 'Recruitment')
      return '+';
    if (transactionType === 'Income')
      return '+';
    if (transactionType === 'War Spoils') {
      if (entry.to_user_id === user?.id)
        return '+';
    }
    return '-';
  };

  return (
    <MainArea title="Bank">
      <SimpleGrid cols={{base:1, xs:2, md:4}}>
        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <Group justify="space-between">
            <Text size="lg" fw={'bold'} c="dimmed">
              Gold On Hand
            </Text>
            <ThemeIcon c='white'>
              <BiCoinStack style={{ width: rem(15), height: rem(15) }} />
            </ThemeIcon>
          </Group>

          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{parseInt(user?.gold?.toString() ?? "0").toLocaleString()}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <Group justify="space-between">
            <Text size="lg" fw={'bold'} c="dimmed">
              Banked Gold
            </Text>
            <ThemeIcon c='white'>
              <BiSolidBank style={{ width: rem(15), height: rem(15) }} />
            </ThemeIcon>
          </Group>
          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{parseInt(user?.goldInBank?.toString() ?? "0").toLocaleString()}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <Group justify="space-between">
            <Text size="lg" fw={'bold'} c="dimmed">
              Daily Deposits
            </Text>
            <ThemeIcon c='white'>
              <BiMoney style={{ width: rem(15), height: rem(15) }} />
            </ThemeIcon>
          </Group>

          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{depositsMax}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <Group justify="space-between">
            <Text size="lg" fw={'bold'} c="dimmed">
              Deposits Available
            </Text>
            <ThemeIcon c='white'>
              <BiMoney style={{ width: rem(15), height: rem(15) }} />
            </ThemeIcon>
          </Group>

          <Group align="flex-end" gap="sm" mt={10}>
            
            <Text>{despositsAvailable}</Text>
          </Group>
          {despositsAvailable < depositsMax && (
            <Group>
              <Text size="lg" c="dimmed">
                Next deposit available in {nextDepositAvailable.hours}:{nextDepositAvailable.minutes}
              </Text>
            </Group>
          )}
        </Paper>
      </SimpleGrid>

      <Space h="md" />
      
      <Tabs defaultValue={currentPage}  className="mb-2 font-medieval">
        <Tabs.List grow justify="center">
          <Tabs.Tab value="deposit" onClick={() => {
            router.push("/structures/bank/deposit");
          }}
            color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'dark' : 'blue'))}
          >
            <span className="text-xl">Deposit</span>
          </Tabs.Tab>
          <Tabs.Tab value="history" onClick={() => { router.push("/structures/bank/history") }}
            color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'dark' : 'blue'))}
          >
            <span className="text-xl">History</span>
          </Tabs.Tab>
          <Tabs.Tab value="economy" onClick={() => { router.push("/structures/bank/economy") }}
            color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'dark' : 'blue'))}
          >
            <span className="text-xl">Economy</span>
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
     
      <Space h="md" />

      {currentPage === 'deposit' && (
        <>
          <Paper shadow="xs" p="md"><form
            onSubmit={(e) => {
              e.preventDefault();
              handleDeposit();
            }}
            className="flex items-end space-x-2"
          >
            <div className="grow">
              <label htmlFor="depositAmount" className="block">
                Amount to Deposit
              </label>
              <label className="text-sm text-gray-600 mb-2 block">You can deposit up to 80% of your gold per transaction</label>
              <NumberInput
                value={depositAmount.toString()}
                onChange={(value) => setDepositAmount(BigInt(value))}
                max={Math.floor(parseInt(user?.gold?.toString()) * 0.8)}
                placeholder="0"
                min={0}
                hideControls
                allowNegative={false}
                error={depositError}
                rightSection={
                  <Button size="compact-xs" c="dimmed" onClick={() => { setDepositAmount(BigInt(Math.floor(parseInt(user?.gold?.toString()) * 0.8)))}}>
                    Max
                  </Button>
                }
                rightSectionWidth={50}
              />
            </div>
            <div>
              <Button
                type="submit"
                className="px-4 py-2 text-white"
              >
                Deposit
              </Button>
            </div>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleWithdraw();
            }}
            className="flex items-end space-x-2"
          >
            <div className="grow">
              <label htmlFor="withdrawAmount" className="mb-2 block">
                Amount to Withdraw
              </label>
              <NumberInput
                  value={withdrawAmount.toString()}
                  onChange={(value) => setWithdrawAmount(BigInt(value))}
                  placeholder="0"
                  min={0}
                  max={parseInt(user?.goldInBank?.toString())}
                  hideControls
                  allowNegative={false}
                  error={withdrawError}
                  rightSection={
                    <>
                      <Button type='button' size='compact-xs' c="dimmed" mr={5} onClick={() => { setWithdrawAmount(BigInt(Math.floor(parseInt(user?.goldInBank?.toString()) * 0.1))) }}>10%</Button>
                      <Button type='button' size='compact-xs' c="dimmed" mr={5} onClick={() => { setWithdrawAmount(BigInt(Math.floor(parseInt(user?.goldInBank?.toString()) * 0.25))) }}>25%</Button>
                      <Button type='button' size='compact-xs' c="dimmed" mr={5} onClick={() => { setWithdrawAmount(BigInt(Math.floor(parseInt(user?.goldInBank?.toString()) * 0.50))) }}>50%</Button>
                      <Button type='button' size='compact-xs' c="dimmed" onClick={() => { setWithdrawAmount(BigInt(Math.floor(parseInt(user?.goldInBank?.toString()) ))) }}>100%</Button>
                    </>
                  }
                  rightSectionWidth={200}
                />
              </div>
            <div>
              <Button
                type="submit"
                className="px-4 py-2 text-white"
              >
                Withdraw
              </Button>
            </div>
            </form>
          </Paper>
          <Space h="md" />
          <Paper shadow="xs" p="md">
            <Table className="min-w-full border-neutral-500" striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Transaction Type</Table.Th>
                  <Table.Th>Amount</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {bankHistory.filter((entry)=>entry.from_user_id === entry.to_user_id).slice(0,10).map((entry, index) => {
                  let transactionType = '';
                  transactionType = getTransactionType(entry);

                  return (
                    <Table.Tr key={index}>
                      <Table.Td>{new Date(entry?.date_time).toLocaleDateString()} {new Date(entry?.date_time).toLocaleTimeString() }</Table.Td>
                      <Table.Td>{transactionType}</Table.Td>
                      <Table.Td>{getGoldTxSymbol(entry) +toLocale(entry.gold_amount, user?.locale)} gold</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Paper>
        </>
      )}

      {currentPage === 'history' && (
        <div>
          <Group><Chip
            variant="filled"
            checked={filters.war_spoils}
            onChange={() => { setFilters({ ...filters, war_spoils: !filters.war_spoils }) }}
            color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'gray': 'blue'))}
          >
            War Spoils
          </Chip>
          <Chip
            variant="filled"
              checked={filters.deposits}
              onChange={() => { setFilters({ ...filters, deposits: !filters.deposits }) }}
              color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'gray' : 'blue'))}
          >
            Deposits
          </Chip>
          <Chip
            variant="filled"
              checked={filters.withdraws}
              onChange={() => { setFilters({ ...filters, withdraws: !filters.withdraws }) }}
              color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'gray' : 'blue'))}
          >
            Withdraws
          </Chip>
          <Chip
            variant="filled"
              checked={filters.transfers}
              onChange={() => { setFilters({ ...filters, transfers: !filters.transfers }) }}
              color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'gray' : 'blue'))}
          >
            Transfers
            </Chip>
            <Chip
              variant="filled"
              checked={filters.sale}
              onChange={() => { setFilters({ ...filters, sale: !filters.sale }) }}
              color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'gray' : 'blue'))}
            >
              Sale
            </Chip>
            <Chip
              variant="filled"
              checked={filters.training}
              onChange={() => { setFilters({ ...filters, training: !filters.training }) }}
              color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'gray' : 'blue'))}
            >
              Training
            </Chip>
            <Chip
              variant="filled"
              checked={filters.recruitment}
              onChange={() => { setFilters({ ...filters, recruitment: !filters.recruitment }) }}
              color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'gray' : 'blue'))}
            >
              Recruitment
            </Chip>
            <Chip
              variant="filled"
              checked={filters.economy}
              onChange={() => { setFilters({ ...filters, economy: !filters.economy }) }}
              color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'gray' : 'blue'))}
            >
              Income
            </Chip>
          </Group>
          {message && <div className="text-center p-4">{message}</div>}
          <Space h="md" />
          {message === '' && bankHistory.length > 0 ? (
            
            <Paper shadow="xs" >
            <Table className="min-w-full border-neutral-500" striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Transaction Type</Table.Th>
                  <Table.Th>Amount</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {bankHistory.map((entry, index) => {
                  let transactionType = '';
                  
                  transactionType = getTransactionType(entry);

                  return (
                    <Table.Tr key={index}>
                      <Table.Td>{new Date(entry.date_time).toLocaleDateString()} {new Date(entry?.date_time).toLocaleTimeString()}</Table.Td>
                      <Table.Td>{transactionType}</Table.Td>
                      <Table.Td>{getGoldTxSymbol(entry) +toLocale(entry.gold_amount, user?.locale)} gold</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
              </Table>
            </Paper>
          ) : (
            <div className="text-center p-4">No Records Found</div>
          )}
        </div>
      )}

      {currentPage === 'economy' && (
        <Flex>
          {/* Workers Card */}
          <Paper className="w-1/2 rounded-lg p-6" shadow='md'>
            <h3 className="text-xl font-semibold">Workers</h3>
            <Divider my="md" />
            <div className="space-y-2">
              <Flex justify={'space-between'}>
                <Text size='md'>Total Workers:</Text>
                <Text size='sm'>{citizenUnit || 0}</Text>
              </Flex>
              <Text c='dimmed' size='sm'>To increase your workforce, visit the training page.</Text>
              <Flex justify={'space-between'}>
                <Text size='md'>Gold Per Worker:</Text>
                <Text size='sm'>{user?.goldPerWorkerPerTurn.toLocaleString()} gold/turn</Text>
              </Flex>
                <Text c='dimmed' size='sm'>
                  To increase your gold per worker, upgrade your economy
                  structure.
                </Text>
            </div>
          </Paper>
          <Space w="md" />

          {/* Operations Card */}
          <Paper className="w-1/2 rounded-lg p-6 shadow-md">
            <h3 className="text-xl font-semibold">Operations</h3>
            <Divider my="md"  />
            <div className="space-y-4">
              <div className="flex justify-between">
                <strong>Current Economy Upgrade:</strong>
                <span>{EconomyUpgrades.find((eu) => eu.index === user?.economyLevel).name}</span>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                This Upgrade will increase bank deposits or gold per worker
              </div>
              <div className="flex justify-between">
                <strong>Fortification Gold Per Turn:</strong>
                <span>{user?.fortificationGoldPerTurn.toLocaleString()}</span>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                As the fortification is upgraded, the fortification gold per turn will increase
              </div>
              <div className="flex justify-between">
                <strong>Worker Gold Per Turn:</strong>
                <span>{user?.workerGoldPerTurn.toLocaleString()}</span>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                Increase this number by training more workers and upgrading your economy
              </div>
              <div className="flex justify-between">
                <strong>Total Gold Per Turn: </strong>
                <span>{user?.goldPerTurn.toLocaleString()}</span>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                This includes workers, fort gold, and any additional wealth bonus
              </div>

              <div className="flex justify-between">
                <strong>Daily Income:</strong>
                <span>{((BigInt(user?.goldPerTurn.toString()) || BigInt(0))  * BigInt(48)).toLocaleString()}</span>
                {/* You can compute and display the daily income here */}
              </div>
            </div>
          </Paper>
        </Flex>
      )}
    </MainArea>
  );
};

export default Bank;
