import {
  faCrown,
  faScroll,
  faShieldAlt,
} from '@fortawesome/free-solid-svg-icons';
import {
  Badge,
  Grid,
  Group,
  Progress,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import type { Locales, PlayerUnit } from '@/types/typings';
import { toLocale } from '@/utils/numberFormatting';

import { GameCard } from './game/GameCard';
import { StyledTable } from './game/StyledTable';

interface BattleResultsProps {
  results: any;
  attackerStats: any;
  defenderStats: any;
}

const BattleResults: React.FC<BattleResultsProps> = ({
  results,
  attackerStats,
  defenderStats,
}) => {
  const { t, i18n } = useTranslation('battle');
  const { user } = useUser();
  const locale = user?.locale ?? (i18n.language as Locales);

  if (!results || !attackerStats || !defenderStats) {
    return (
      <GameCard title={t('battleSimulator.results.title')}>
        <Text>{t('battleSimulator.results.incomplete')}</Text>
      </GameCard>
    );
  }

  const defenderFort = Fortifications[results.defender.fortLevel];
  const getTotalUnits = (unitTotals: any): number => {
    if (!unitTotals) return 0;
    if (typeof unitTotals === 'object' && !Array.isArray(unitTotals)) {
      let total = 0;
      for (const value of Object.values(unitTotals)) {
        if (typeof value === 'number') total += value;
        else if (typeof value === 'string' && !isNaN(Number(value)))
          total += Number(value);
      }
      return total;
    }
    return 0;
  };

  const attackerTotalUnits = getTotalUnits(attackerStats.unitTotals);
  const defenderTotalUnits = getTotalUnits(defenderStats.unitTotals);
  const winner =
    results.result === 'WIN'
      ? t('battleSimulator.results.attackerWon')
      : t('battleSimulator.results.defenderWon');
  const lossHeaders = [
    t('battleSimulator.results.unit'),
    t('battleSimulator.results.losses'),
  ];

  const renderUnitLosses = (losses: PlayerUnit[]) => {
    const sortedUnits = [...losses].sort(
      (a, b) => a.type.localeCompare(b.type) || a.level - b.level,
    );
    if (sortedUnits.length === 0) {
      return (
        <Table.Tr>
          <Table.Td colSpan={2} style={{ textAlign: 'center' }}>
            {t('battleSimulator.results.noLosses')}
          </Table.Td>
        </Table.Tr>
      );
    }
    return sortedUnits.map(({ type, level, quantity }) => (
      <Table.Tr key={`${type}-${level}`}>
        <Table.Td>
          {t('battleSimulator.results.unitLevel', {
            unit: t(`unitTypes.${type}`, { defaultValue: type }),
            level,
          })}
        </Table.Td>
        <Table.Td>{toLocale(quantity, locale)}</Table.Td>
      </Table.Tr>
    ));
  };

  const renderSide = (
    stats: any,
    totalUnits: number,
    losses: { total: number; units: PlayerUnit[] },
  ) => (
    <>
      <Text>
        {t('battleSimulator.results.attackPower', {
          value: toLocale(stats.attackPower, locale),
        })}
      </Text>
      <Text>
        {t('battleSimulator.results.defensePower', {
          value: toLocale(stats.defensePower, locale),
        })}
      </Text>
      <Text>
        {t('battleSimulator.results.totalUnits', {
          value: toLocale(totalUnits, locale),
        })}
      </Text>
      <Text fw={700} c="red">
        {t('battleSimulator.results.lossesTotal', {
          count: losses.total,
          value: toLocale(losses.total, locale),
        })}
      </Text>
      <Progress
        value={(losses.total / totalUnits) * 100}
        color="red"
        size="lg"
        striped
        animated
      />
      <StyledTable headers={lossHeaders}>
        {renderUnitLosses(losses.units)}
      </StyledTable>
    </>
  );

  return (
    <Stack gap="md">
      <GameCard title={t('battleSimulator.results.title')} icon={faCrown}>
        <Group justify="center">
          <Badge size="xl" color={results.result === 'WIN' ? 'green' : 'red'}>
            {winner}
          </Badge>
        </Group>
      </GameCard>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <GameCard title={t('battleSimulator.attacker')} goldAccent={false}>
            {renderSide(
              attackerStats,
              attackerTotalUnits,
              results.Losses.Attacker,
            )}
          </GameCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <GameCard title={t('battleSimulator.defender')} goldAccent={false}>
            {renderSide(
              defenderStats,
              defenderTotalUnits,
              results.Losses.Defender,
            )}
          </GameCard>
        </Grid.Col>
        <Grid.Col span={12}>
          <GameCard
            title={t('battleSimulator.results.fortStatus')}
            icon={faShieldAlt}
            goldAccent={false}
          >
            <Text>
              {t('battleSimulator.results.fortLevel', {
                level: results.defender.fortLevel,
              })}
            </Text>
            <Text>
              {t('battleSimulator.results.fortHp', {
                current: toLocale(results.finalFortHP, locale),
                max: toLocale(defenderFort.hitpoints, locale),
              })}
            </Text>
            <Progress
              value={(results.finalFortHP / defenderFort.hitpoints) * 100}
              color={
                results.finalFortHP < defenderFort.hitpoints / 2
                  ? 'red'
                  : 'blue'
              }
              size="lg"
              striped
              animated
            />
          </GameCard>
        </Grid.Col>
        <Grid.Col span={12}>
          <GameCard
            title={t('battleSimulator.results.battleLog')}
            icon={faScroll}
            goldAccent={false}
          >
            <Text>
              {t('battleSimulator.results.turnsTaken', {
                turns: results.turnsTaken,
              })}
            </Text>
            {results.log && (
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  maxHeight: 300,
                  overflow: 'auto',
                }}
              >
                {results.log}
              </pre>
            )}
          </GameCard>
        </Grid.Col>
      </Grid>
    </Stack>
  );
};

export default BattleResults;
