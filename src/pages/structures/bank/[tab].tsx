import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
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
import { getSafeLocale } from '@/utils/i18n';
import { InferGetServerSidePropsType } from "next";

const defaultFilters = {
  deposits: true, withdraws: true, war_spoils: true, transfers: true, sale: true,
  training: true, recruitment: true, economy: true, fortification: true, daily: true,
};

export default function Bank(props: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useTranslation('structures');
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
    { label: t('bank.goldOnHand'), value: toLocale(user?.gold, user?.locale), icon: <BiCoinStack size={18} /> },
    { label: t('bank.bankedGold'), value: toLocale(user?.goldInBank, user?.locale), icon: <BiSolidBank size={18} /> },
    { label: t('bank.dailyDeposits'), value: user?.maximumBankDeposits ?? 0, icon: <BiMoney size={18} /> },
    {
      label: t('bank.depositsAvailable'),
      value: user?.depositsAvailable < (user?.maximumBankDeposits ?? 0)
        ? `${user?.depositsAvailable ?? 0} ${t('bank.nextDepositIn', { hours: user?.nextDepositAvailable?.hours ?? 0, minutes: user?.nextDepositAvailable?.minutes ?? 0 })}`
        : user?.depositsAvailable ?? 0,
      icon: <BiMoney size={18} />,
    },
  ];

  return (
    <MainArea title={t('bank.title')}>
      <StatGrid title={t('bank.overview')} stats={statItems} />
      <Space h="md" />
      <Tabs value={tab} onChange={(value) => router.push(`/structures/bank/${value}`)} variant="pills" color="yellow">
        <Tabs.List grow justify="center">
          <Tabs.Tab value="deposit">{t('bank.deposit')}</Tabs.Tab>
          <Tabs.Tab value="history">{t('bank.history')}</Tabs.Tab>
          <Tabs.Tab value="economy">{t('bank.economy')}</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Space h="md" />

      {tab === 'deposit' && <BankDepositWithdraw user={user} forceUpdate={forceUpdate} />}

      {tab === 'history' && (
        <GameCard title={t('bank.transactionHistory')} icon={<BiSolidBank size={16} />}>
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
          <GameCard title={t('bank.workers')} icon={<BiUserCircle size={16} />}>
            <p>{t('bank.totalWorkers')} {user?.units.find(u => u.type === 'WORKER')?.quantity || 0}</p>
            <p>{t('bank.goldPerWorker')} {user?.goldPerWorkerPerTurn.toLocaleString()} {t('common.currency.gold')}/{t('common.units.turn')}</p>
            <p>{t('bank.workerGoldPerTurn')} {user?.workerGoldPerTurn.toLocaleString()} {t('common.currency.gold')}/{t('common.units.turn')}</p>
            <p>{t('bank.totalGoldPerTurn')} {user?.goldPerTurn.toLocaleString()} {t('common.currency.gold')}/{t('common.units.turn')}</p>
            <p>{t('bank.dailyIncome')} {(BigInt(user?.goldPerTurn.toString() || '0') * BigInt(48)).toLocaleString()}</p>
          </GameCard>
          <GameCard title={t('bank.operations')} icon={<BiLineChart size={16} />}>
            <p>{t('bank.currentUpgrade')} {EconomyUpgrades.find(eu => eu.index === user?.economyLevel)?.name}</p>
            <p>{t('bank.fortGoldPerTurn')} {user?.fortificationGoldPerTurn.toLocaleString()}</p>
            <p>{t('bank.workerGoldPerTurn')} {user?.workerGoldPerTurn.toLocaleString()}</p>
            <p>{t('bank.totalGoldPerTurn')} {user?.goldPerTurn.toLocaleString()}</p>
            <p>{t('bank.dailyIncome')} {(BigInt(user?.goldPerTurn.toString() || '0') * BigInt(48)).toLocaleString()}</p>
          </GameCard>
        </SimpleGrid>
      )}
    </MainArea>
  );
}

export const getServerSideProps = async (context: any) => {
  return {
    props: {
      ...(await serverSideTranslations(getSafeLocale(context), ['structures'])),
    },
  };
};
