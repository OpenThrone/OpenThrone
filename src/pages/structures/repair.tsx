import {
  faArrowRight,
  faClockRotateLeft,
  faCoins,
  faScrewdriverWrench,
  faUniversity,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Badge,
  Button,
  Center,
  Group,
  RingProgress,
  SimpleGrid,
  Space,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import QuantityInput from '@/components/battle/QuantityInput';
import { GameCard } from '@/components/game/GameCard';
import { PageLoading } from '@/components/game/PageLoading';
import { StatGrid } from '@/components/game/StatGrid';
import { StyledTable } from '@/components/game/StyledTable';
import MainArea from '@/components/MainArea';
import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import { alertService } from '@/services/Alert.service';
import type { Locales } from '@/types/typings';
import { logError } from '@/utils/logger';
import { toLocale } from '@/utils/numberFormatting';
import { fortificationName } from '@/utils/structureNames';

const Repair = () => {
  const { t, i18n } = useTranslation('structures');
  const locale = i18n.language as Locales;
  const { user, forceUpdate } = useUser();
  const [fortification, setFortification] = useState(null);
  const [repairPoints, setRepairPoints] = useState(0);
  const [history, setHistory] = useState([]);
  const [isRepairing, setIsRepairing] = useState(false);

  useEffect(() => {
    if (user?.fortLevel) {
      setFortification(
        Fortifications.find((fort) => fort.level === user.fortLevel),
      );
    }
    if (user) {
      fetch(`/api/bank/history?fortification=true`)
        .then((res) => res.json())
        .then((data) => setHistory(data.rows))
        .catch((err) => logError('Error fetching bank history:', err));
    }
  }, [user]);

  const handleRepair = async (amount: number) => {
    if (isRepairing || amount <= 0) return;
    setIsRepairing(true);
    try {
      const response = await fetch('/api/account/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repairPoints: amount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t('repair.repairFailed'));
      alertService.success(data.message || t('repair.repairSuccess'));
      forceUpdate();
      setRepairPoints(0);
    } catch (error: unknown) {
      alertService.error((error as Error).message);
    } finally {
      setIsRepairing(false);
    }
  };

  if (!user || !fortification) {
    return (
      <MainArea title={t('repair.fortRepairTitle')}>
        <PageLoading
          label={t('repair.loading')}
          cardTitle={t('repair.fortRepairTitle')}
        />
      </MainArea>
    );
  }

  const remainingHitpoints = fortification.hitpoints - user.fortHitpoints;
  const healthPercentage = Math.floor(
    (user.fortHitpoints / fortification.hitpoints) * 100,
  );

  const statItems = [
    {
      label: t('bank.goldInHand'),
      value: toLocale(user.gold, locale),
      icon: <FontAwesomeIcon icon={faCoins} />,
    },
    {
      label: t('bank.goldInBank'),
      value: toLocale(user.goldInBank, locale),
      icon: faUniversity,
    },
  ];

  const historyRows = history.map((entry) => (
    <Table.Tr key={entry.id}>
      <Table.Td>{new Date(entry.date_time).toLocaleString(locale)}</Table.Td>
      <Table.Td>
        +{toLocale(entry.stats.actualRepairAmount ?? 0, locale)}
      </Table.Td>
      <Table.Td>
        {toLocale(entry.stats.currentFortHP ?? 0, locale)}{' '}
        <FontAwesomeIcon icon={faArrowRight} />{' '}
        {toLocale(entry.stats.newFortHP ?? 0, locale)}
      </Table.Td>
      <Table.Td>-{toLocale(entry.gold_amount, locale)}</Table.Td>
    </Table.Tr>
  ));

  return (
    <MainArea title={t('repair.fortRepairTitle')}>
      <StatGrid title={t('repair.resources')} stats={statItems} />
      <Space h="md" />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <GameCard
          title={t('repair.status')}
          icon={faArrowRight}
          goldAccent={remainingHitpoints > 0}
        >
          <Group justify="space-between">
            <Stack gap="xs">
              <Text size="xl" fw={700}>
                {fortificationName(t, fortification.level) ??
                  fortification.name}
              </Text>
              <Badge color={remainingHitpoints > 0 ? 'red' : 'green'}>
                {remainingHitpoints > 0
                  ? t('repair.damaged')
                  : t('repair.fullyRepaired')}
              </Badge>
            </Stack>
            <RingProgress
              sections={[
                {
                  value: healthPercentage,
                  color: healthPercentage < 50 ? 'red' : 'yellow',
                },
              ]}
              label={
                <Center>
                  <Text>{healthPercentage}%</Text>
                </Center>
              }
            />
          </Group>
          <Text mt="md">
            {t('repair.hitpoints', {
              current: toLocale(user.fortHitpoints, locale),
              max: toLocale(fortification.hitpoints, locale),
            })}
          </Text>
        </GameCard>
        <GameCard
          title={t('repair.repair')}
          icon={<FontAwesomeIcon icon={faScrewdriverWrench} />}
        >
          <QuantityInput
            label={t('repair.amountToRepair')}
            value={repairPoints}
            onChange={setRepairPoints}
            max={Math.max(0, remainingHitpoints)}
            grow
            onMax={() => setRepairPoints(Math.max(0, remainingHitpoints))}
            maxAriaLabel={t('repair.maxAria')}
            maxDisabled={remainingHitpoints <= 0}
          />
          <Text size="sm" c="dimmed" mt="xs">
            {t('repair.cost')}:{' '}
            {t('repair.costGold', {
              amount: toLocale(
                repairPoints * fortification.costPerRepairPoint,
                locale,
              ),
            })}
          </Text>
          <Group mt="md">
            <Button
              onClick={() => handleRepair(repairPoints)}
              disabled={repairPoints <= 0 || isRepairing}
            >
              {t('repair.repair')}
            </Button>
            <Button
              onClick={() => handleRepair(remainingHitpoints)}
              disabled={remainingHitpoints <= 0 || isRepairing}
            >
              {t('repair.repairAll')}
            </Button>
          </Group>
        </GameCard>
      </SimpleGrid>
      <Space h="md" />
      <GameCard
        title={t('repair.history')}
        icon={<FontAwesomeIcon icon={faClockRotateLeft} />}
      >
        <StyledTable
          headers={[
            t('bank.date'),
            t('repair.hpRepaired'),
            t('repair.hpChange'),
            t('repair.cost'),
          ]}
        >
          {historyRows}
        </StyledTable>
      </GameCard>
    </MainArea>
  );
};

export default Repair;
