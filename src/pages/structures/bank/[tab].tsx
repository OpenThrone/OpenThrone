import {
  faBuildingColumns,
  faChartLine,
  faCoins,
  faGears,
  faMoneyBillWave,
  faUserTie,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Box, SimpleGrid, Space, Stack, Tabs, Text } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';

import BankDepositWithdraw from '@/components/BankDepositWithdraw';
import BankHistoryFilters from '@/components/BankHistoryFilters';
import BankHistoryTable from '@/components/BankHistoryTable';
import { GameCard } from '@/components/game/GameCard';
import { StatGrid } from '@/components/game/StatGrid';
import MainArea from '@/components/MainArea';
import { EconomyUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import classes from '@/pages/structures/bank/[tab].module.css';
import { logError } from '@/utils/logger';
import { toLocale } from '@/utils/numberFormatting';
import { getGoldTxSymbol, getTransactionType } from '@/utils/utilities';

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

const TURNS_PER_DAY = 48;

function EconomyRow({
  label,
  children,
  accent = false,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Box className={classes.economyRow}>
      <Text
        component="dt"
        size="sm"
        c={accent ? 'var(--ot-heading)' : 'var(--ot-muted)'}
      >
        {label}
      </Text>
      <Text
        component="dd"
        size="sm"
        fw={600}
        m={0}
        c={accent ? 'var(--ot-heading)' : 'var(--ot-body)'}
        className={classes.economyValue}
      >
        {children}
      </Text>
    </Box>
  );
}

/** Bank. */
export default function Bank() {
  const { t } = useTranslation('structures');
  const router = useRouter();
  const tabParam = Array.isArray(router.query.tab)
    ? router.query.tab[0]
    : router.query.tab;
  const tab = tabParam || 'deposit';
  const [filters, setFilters] = useLocalStorage({
    key: 'bankHistoryFilters',
    defaultValue: defaultFilters,
  });
  const { user, forceUpdate } = useUser();
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(0);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    if (!user) return;
    if (tab === 'history') {
      const queryParams = new URLSearchParams({
        ...Object.fromEntries(
          Object.entries(filters).map(([k, v]) => [k, String(v)]),
        ),
        page: String(page),
        limit: String(limit),
      });
      fetch(`/api/bank/history?${queryParams.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          setHistory(data.rows);
          setTotalPages(data.totalPages);
        })
        .catch((err) => logError('Error fetching bank history:', err));
    }
  }, [tab, filters, user, page, limit]);

  const dailyIncome =
    BigInt(user?.goldPerTurn?.toString() ?? '0') * BigInt(TURNS_PER_DAY);
  const formatGold = (amount: number | bigint | string | undefined) =>
    (typeof amount === 'string'
      ? BigInt(amount)
      : (amount ?? 0)
    ).toLocaleString(user?.locale);
  const perTurn = (amount: number | bigint | string | undefined) =>
    t('bank.incomePerTurn', { amount: formatGold(amount) });
  const nextDeposit = user?.nextDepositAvailable;

  const statItems = [
    {
      label: t('bank.goldOnHand'),
      value: toLocale(user?.gold, user?.locale),
      icon: <FontAwesomeIcon icon={faCoins} />,
    },
    {
      label: t('bank.bankedGold'),
      value: toLocale(user?.goldInBank, user?.locale),
      icon: <FontAwesomeIcon icon={faBuildingColumns} />,
    },
    {
      label: t('bank.depositsRemaining'),
      value: (
        <>
          {t('bank.depositsRemainingCount', {
            available: user?.depositsAvailable ?? 0,
            maximum: user?.maximumBankDeposits ?? 0,
          })}
          <Text
            component="span"
            size="xs"
            fw={400}
            c="var(--ot-muted)"
            display="block"
          >
            {nextDeposit &&
            user?.depositsAvailable < (user?.maximumBankDeposits ?? 0)
              ? t('bank.nextDepositIn', {
                  hours: nextDeposit.hours,
                  minutes: String(nextDeposit.minutes).padStart(2, '0'),
                })
              : t('bank.rollingDepositLimit')}
          </Text>
        </>
      ),
      icon: <FontAwesomeIcon icon={faMoneyBillWave} />,
    },
    {
      label: t('bank.projectedDailyIncome'),
      value: formatGold(dailyIncome),
      icon: <FontAwesomeIcon icon={faChartLine} />,
    },
  ];

  return (
    <MainArea title={t('bank.title')}>
      <StatGrid title={t('bank.overview')} stats={statItems} />
      <Space h="md" />
      <Tabs
        value={tab}
        onChange={(value) => {
          if (value) {
            router.push(`/structures/bank/${value}`, undefined, {
              locale: router.locale,
            });
          }
        }}
        variant="pills"
      >
        <Tabs.List grow justify="center">
          <Tabs.Tab value="deposit">{t('bank.deposit')}</Tabs.Tab>
          <Tabs.Tab value="history">{t('bank.history')}</Tabs.Tab>
          <Tabs.Tab value="economy">{t('bank.economy')}</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Space h="md" />

      {tab === 'deposit' && (
        <div data-tour-id="bank-panel">
          <BankDepositWithdraw user={user} forceUpdate={forceUpdate} />
        </div>
      )}

      {tab === 'history' && (
        <GameCard
          title={t('bank.transactionHistory')}
          icon={<FontAwesomeIcon icon={faBuildingColumns} />}
        >
          <BankHistoryFilters
            colorScheme={user?.colorScheme}
            filters={filters}
            setFilters={setFilters}
          />
          <BankHistoryTable
            bankHistory={history}
            user={user}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            getTransactionType={(entry) =>
              getTransactionType(entry, (key) => t(key))
            }
            getGoldTxSymbol={getGoldTxSymbol}
          />
        </GameCard>
      )}

      {tab === 'economy' && (
        <Box>
          <Text component="h2" size="lg" fw={600} c="var(--ot-heading)" mb="sm">
            {t('bank.economyBreakdown')}
          </Text>
          <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
            <GameCard
              title={t('bank.workers')}
              icon={<FontAwesomeIcon icon={faUserTie} />}
            >
              <Stack component="dl" gap="xs" m={0}>
                <EconomyRow label={t('bank.workersTotal')}>
                  {formatGold(
                    user?.units
                      ?.filter((unit) => unit.type === 'WORKER')
                      .reduce((total, unit) => total + unit.quantity, 0),
                  )}
                </EconomyRow>
                <EconomyRow label={t('bank.goldPerWorker')}>
                  {perTurn(user?.goldPerWorkerPerTurn)}
                </EconomyRow>
                <EconomyRow label={t('bank.workerSubtotal')} accent>
                  +{perTurn(user?.workerGoldPerTurn)}
                </EconomyRow>
              </Stack>
            </GameCard>
            <GameCard
              title={t('bank.operations')}
              icon={<FontAwesomeIcon icon={faGears} />}
            >
              <Stack component="dl" gap="xs" m={0}>
                <EconomyRow label={t('bank.incomeUpgrade')}>
                  {EconomyUpgrades.find(
                    (upgrade) => upgrade.index === user?.economyLevel,
                  )?.name ?? '—'}
                </EconomyRow>
                <EconomyRow label={t('bank.fortIncome')} accent>
                  +{perTurn(user?.fortificationGoldPerTurn)}
                </EconomyRow>
              </Stack>
            </GameCard>
            <GameCard
              title={t('bank.financialTotals')}
              icon={<FontAwesomeIcon icon={faChartLine} />}
            >
              <Stack component="dl" gap="xs" m={0}>
                <EconomyRow label={t('bank.totalIncome')}>
                  {perTurn(user?.goldPerTurn)}
                </EconomyRow>
                <EconomyRow label={t('bank.turnsPerDay')}>
                  {TURNS_PER_DAY}
                </EconomyRow>
                <Box className={classes.dailyTotal}>
                  <Text component="dt" size="sm" c="var(--ot-heading)">
                    {t('bank.estimatedDailyIncome')}
                  </Text>
                  <Text
                    component="dd"
                    size="xl"
                    fw={700}
                    m={0}
                    c="var(--ot-heading)"
                    className={classes.economyValue}
                  >
                    {formatGold(dailyIncome)}
                  </Text>
                </Box>
              </Stack>
              <Text size="xs" c="var(--ot-muted)" mt="xs">
                {t('bank.incomeProjectionNote')}
              </Text>
            </GameCard>
          </SimpleGrid>
        </Box>
      )}
    </MainArea>
  );
}
