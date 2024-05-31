import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

import { alertService } from '@/services';
import { useUser } from '@/context/users';
import Alert from '@/components/alert';
import toLocale, { stringifyObj } from '@/utils/numberFormatting';
import { Chip, Group, Paper, Table, Tabs, SimpleGrid, Text, Space, NumberInput, rem, ThemeIcon } from '@mantine/core';
import { BiCoinStack, BiMoney, BiMoneyWithdraw, BiSolidBank } from "react-icons/bi";
import classes from './[tab].module.css'
import user from '@/pages/messaging/compose/[user]';

const Bank = (props) => {
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
  const [nextDepositAvailable, setNextDepositAvailable] = useState({hours: 0, minutes: 0, seconds: 0});

  const [filters, setFilters] = useState({
    deposits: true,
    withdraws: true,
    war_spoils: true,
    transfers: true,
    sale:true
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
    }
  }, [user]);

  const handleDeposit = async () => {
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

        // Handle error
      } else {
        // Update the user context or fetch new data
        forceUpdate();
        alertService.success("Successfully deposited gold");
        fetch('/api/bank/getDeposits')
          .then((response) => response.json())
          .then((data) => setDepositsAvailable(data.deposits))
          .catch((error) => console.error('Error fetching bank history:', error));
        setDepositAmount(BigInt(0));
      }
    } catch (error) {
      console.error('Error depositing:', error);
      alertService.error('Failed to deposit gold. Please try again.');
    }
  };
  const handleWithdraw = async () => {
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
      }
    } catch (error) {
      console.error('Error withdrawing:', error);
      alertService.error('Failed to withdraw gold. Please try again.');
    }
  };

  return (
    <div className="mainArea pb-10">
      <h2>Bank</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
      <SimpleGrid cols={{base:1, xs:2, md:4}}>
        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <ThemeIcon size={30} radius={30} className={classes.icon} color='gray'>
            <BiCoinStack style={{ width: rem(15), height: rem(15) }} />
          </ThemeIcon>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Gold On Hand
            </Text>
          </Group>

          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{parseInt(user?.gold?.toString() ?? "0").toLocaleString()}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <ThemeIcon size={30} radius={30} className={classes.icon} color='gray'>
            <BiSolidBank style={{ width: rem(15), height: rem(15) }} />
          </ThemeIcon>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Banked Gold
            </Text>
          </Group>
          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{parseInt(user?.goldInBank?.toString() ?? "0").toLocaleString()}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <ThemeIcon size={30} radius={30} className={classes.icon} color='gray'>
            <BiMoney style={{ width: rem(15), height: rem(15) }}  />
          </ThemeIcon>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Max Deposits Per Day
            </Text>
          </Group>

          <Group align="flex-end" gap="xs" mt={10}>
            <Text>{depositsMax}</Text>
          </Group>
        </Paper>
        <Paper withBorder p="sm" radius="md" className={classes.card}>
          <ThemeIcon size={30} radius={30} className={classes.icon} color='gray'>
            <BiMoneyWithdraw style={{ width: rem(15), height: rem(15) }}  />
          </ThemeIcon>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Deposits Available Today
            </Text>
          </Group>

          <Group align="flex-end" gap="sm" mt={10}>
            
            <Text>{despositsAvailable}</Text>
          </Group>
          {despositsAvailable < depositsMax && (
            <Group>
              <Text size="xs" c="dimmed">
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
              <label htmlFor="depositAmount" className="mb-2 block">
                Amount to Deposit
              </label>
              <NumberInput
                value={depositAmount.toString()}
                onChange={(value) => setDepositAmount(BigInt(value))}
                placeholder="0"
                min={0}
                hideControls
                rightSection={
                  <Text size="sm" c="dimmed" onClick={() => { setDepositAmount(BigInt(user?.gold?.toString()))}}>
                    Max: {parseInt(user?.gold?.toString())}
                  </Text>
                }
                rightSectionWidth={100}
              />
            </div>
            <div>
              <button
                type="submit"
                className="bg-blue-500 px-4 py-2 text-white"
              >
                Deposit
              </button>
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
              /></div>
            <div>
              <button
                type="submit"
                className="bg-blue-500 px-4 py-2 text-white"
              >
                Withdraw
              </button>
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
                  console.log('history type: ', entry.history_type)
                  if (entry.from_user_id === entry.to_user_id) {
                    transactionType =
                      entry.from_user_account_type === 'HAND'
                        ? (entry.history_type === 'SALE'? 'Purchase' : 'Deposit')
                      : (entry.history_type === 'SALE' ? 'Sale' : 'Withdraw');
                  }

                  return (
                    <Table.Tr key={index}>
                      <Table.Td>{new Date(entry?.date_time).toLocaleDateString()}</Table.Td>
                      <Table.Td>{transactionType}</Table.Td>
                      <Table.Td>{toLocale(entry.gold_amount, user?.locale)} gold</Table.Td>
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
                  
                  if (entry.from_user_id === entry.to_user_id) {
                    transactionType =
                      entry.from_user_account_type === 'HAND'
                        ? (entry.history_type === 'SALE' ? 'Purchase' : 'Deposit')
                        : (entry.history_type === 'SALE' ? 'Sale' : 'Withdraw');
                  } else if (entry.history_type === 'PLAYER_TRANSFER') {
                    transactionType = 'Player Transfer';
                  } else {
                    transactionType = 'War Spoils';
                  }

                  return (
                    <Table.Tr key={index}>
                      <Table.Td>{new Date(entry.date_time).toLocaleDateString()}</Table.Td>
                      <Table.Td>{transactionType}</Table.Td>
                      <Table.Td>{toLocale(entry.gold_amount, user?.locale)} gold</Table.Td>
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
        <div className="flex space-x-8">
          {/* Workers Card */}
          <div className="w-1/2 rounded-lg  p-6 shadow-md">
            <h3 className="mb-4 text-xl font-semibold">Workers</h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <strong>Total Workers:</strong>
                <span>{citizenUnit || 0}</span>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                <p>To increase your workforce, visit the training page.</p>
              </div>
              <div className="flex justify-between">
                <strong>Gold Per Worker:</strong>
                <span>{user?.goldPerWorkerPerTurn.toLocaleString()} gold/turn</span>
              </div>
              <div className="mt-6 text-sm text-gray-600">
                <p>
                  To increase your gold per worker, upgrade your economy
                  structure.
                </p>
              </div>
            </div>
          </div>

          {/* Operations Card */}
          <div className="w-1/2 rounded-lg  p-6 shadow-md">
            <h3 className="mb-4 text-xl font-semibold">Operations</h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <strong>Current Economy Upgrade:</strong>
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
          </div>
        </div>
      )}
    </div>
  );
};

export default Bank;
