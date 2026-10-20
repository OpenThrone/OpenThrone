import {
  faBinoculars,
  faChartPie,
  faWarehouse,
} from '@fortawesome/free-solid-svg-icons';
import { Box, Grid, Group, RingProgress, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';

import { useUser } from '@/context/users';
import type { PlayerItem, PlayerUnit } from '@/types/typings';
import { toLocale } from '@/utils/numberFormatting';

import { GameCard } from './game/GameCard';
import { MissionLog, SpyReportShell } from './SpyReportShell';

const itemColors = {
  HELM: 'grey',
  ARMOR: 'yellow',
  BOOTS: 'red',
  BRACERS: 'blue',
  SHIELD: 'green',
  WEAPON: 'purple',
};

const IntelResult = ({ battle, viewerID, lastGenerated }) => {
  const { t } = useTranslation('common');
  const { user } = useUser();
  const locale = user?.locale;
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const isAttackerWinner = winner === attackerPlayer.id;
  const isViewerDefender = viewerID === defenderPlayer.id;

  const observedUnits = useMemo<PlayerUnit[]>(() => {
    const intel = stats.spyResults.intelligenceGathered;
    return [
      ...(Array.isArray(intel?.units) ? intel.units : []),
      ...(Array.isArray(intel?.mercenaries) ? intel.mercenaries : []),
    ].filter((unit) => unit.quantity > 0);
  }, [stats]);
  const totalPopulation = useMemo(
    () =>
      observedUnits.reduce((total, unit) => total + Number(unit.quantity), 0),
    [observedUnits],
  );
  const hasFullIntel = stats.spyResults.intelPercentage === 100;

  const unitSegments = useMemo(() => {
    const unitColors = {
      CITIZEN: 'grey',
      WORKER: 'yellow',
      OFFENSE: 'red',
      DEFENSE: 'blue',
      SPY: 'green',
      SENTRY: 'purple',
    };

    return observedUnits.map((unit) => ({
      label: `${unit.type}`,
      quantity: unit.quantity,
      part: totalPopulation > 0 ? (unit.quantity / totalPopulation) * 100 : 0,
      color: unitColors[unit.type] || 'black',
    }));
  }, [observedUnits, totalPopulation]);

  const itemsByCategory = useMemo(() => {
    if (stats.spyResults.intelligenceGathered?.items?.length === 0) {
      return [];
    }
    const itemCategories = ['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'];
    const itemTypes = ['HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD', 'WEAPON'];

    const itemsArray: PlayerItem[] = stats.spyResults.intelligenceGathered
      ?.items
      ? Object.values(stats.spyResults.intelligenceGathered.items)
      : [];
    return itemCategories.map((category) => {
      const categoryUnits = observedUnits
        .filter((unit) => unit.type === category)
        .reduce((acc, unit) => acc + unit.quantity, 0);
      const categoryItems = itemsArray.filter(
        (item) => item.usage === category,
      );
      const combinedItems = itemTypes
        .map((type) => {
          const totalQuantity = categoryItems
            .filter((item) => item.type === type)
            .reduce((acc, item) => Number(acc) + Number(item.quantity), 0);
          return {
            type,
            quantity: totalQuantity,
            percentage:
              hasFullIntel && categoryUnits > 0
                ? Math.min(
                    (Number(totalQuantity) / Number(categoryUnits)) * 100,
                    100,
                  )
                : null,
          };
        })
        .filter((item) => item.quantity > 0);

      return {
        name: category,
        total: categoryUnits,
        itemsBreakdown: combinedItems,
        color:
          category === 'OFFENSE'
            ? 'red'
            : category === 'DEFENSE'
              ? 'blue'
              : category === 'SPY'
                ? 'green'
                : 'purple',
      };
    });
  }, [stats, observedUnits, hasFullIntel]);

  return (
    <SpyReportShell
      battle={battle}
      viewerID={viewerID}
      mission="intel"
      icon={faBinoculars}
      lastGenerated={lastGenerated}
    >
      {!isAttackerWinner && (
        <MissionLog
          title={t('spyReport.missionLog')}
          lines={[
            Number(stats.spyResults.spiesLost ?? 0) > 0
              ? t(
                  `spyReport.${isViewerDefender ? 'defender' : 'attacker'}SpiesLost`,
                  { count: Number(stats.spyResults.spiesLost) },
                )
              : t(
                  `spyReport.${isViewerDefender ? 'defender' : 'attacker'}NoSpiesLost`,
                ),
          ]}
        />
      )}
      {isAttackerWinner && (
        <Grid grow gutter="md" mt="xl">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <GameCard
              title={t('intelReport.observedPopulation')}
              icon={faChartPie}
            >
              <Group justify="center">
                <RingProgress
                  size={170}
                  thickness={16}
                  label={
                    <Text size="xs" ta="center">
                      {t('intelReport.observedTotal', {
                        replace: { count: toLocale(totalPopulation, locale) },
                      })}
                    </Text>
                  }
                  sections={unitSegments.map((s) => ({
                    value: s.part,
                    color: s.color,
                    tooltip: `${toLocale(s.quantity, locale)} ${t(`intelReport.unitTypes.${s.label}`, { defaultValue: s.label })}`,
                  }))}
                />
              </Group>
              {!hasFullIntel && (
                <Text size="sm" ta="center" mt="sm">
                  {t('intelReport.unobservedPopulation')}
                </Text>
              )}
              <Grid mt="md">
                {unitSegments.map((segment, index) => (
                  <Grid.Col span={4} key={index}>
                    <Box
                      style={{
                        backgroundColor: '#0f141a',
                        borderRadius: '6px',
                        border: '1px solid #1f2b3b',
                        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                        padding: '8px',
                        textAlign: 'center',
                      }}
                    >
                      <Text tt="uppercase" fz="xs" c="dimmed">
                        {t(`intelReport.unitTypes.${segment.label}`, {
                          defaultValue: segment.label,
                        })}
                      </Text>
                      <Text fw={700}>{toLocale(segment.quantity, locale)}</Text>
                    </Box>
                  </Grid.Col>
                ))}
              </Grid>
            </GameCard>
          </Grid.Col>
          {itemsByCategory.map(
            (category, index) =>
              category.itemsBreakdown.length > 0 && (
                <Grid.Col span={{ base: 12, md: 6 }} key={index}>
                  <GameCard
                    title={t('intelReport.armoryTitle', {
                      type: t(`intelReport.unitTypes.${category.name}`),
                    })}
                    icon={faWarehouse}
                  >
                    <Group justify="center">
                      <RingProgress
                        size={170}
                        thickness={16}
                        label={
                          <Text size="xs" ta="center">
                            {t(
                              `intelReport.observedRoleUnits.${category.name}`,
                              {
                                replace: {
                                  count: toLocale(category.total, locale),
                                },
                              },
                            )}
                          </Text>
                        }
                        sections={category.itemsBreakdown.map((item) => ({
                          value: item.percentage || 0,
                          color: itemColors[item.type],
                          tooltip: `${toLocale(item.quantity, locale)} ${t(`intelReport.itemTypes.${item.type}`, { defaultValue: item.type })}`,
                        }))}
                      />
                    </Group>
                    <Grid mt="md">
                      {category.itemsBreakdown.map((item, idx) => (
                        <Grid.Col span={4} key={idx}>
                          <Box
                            style={{
                              backgroundColor: '#0f141a',
                              borderRadius: '6px',
                              border: '1px solid #1f2b3b',
                              boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                              padding: '8px',
                              textAlign: 'center',
                            }}
                          >
                            <Text tt="uppercase" fz="xs" c="dimmed">
                              {t(`intelReport.itemTypes.${item.type}`, {
                                defaultValue: item.type,
                              })}
                            </Text>
                            <Text fw={700}>
                              {toLocale(item.quantity, locale)}
                              {item.percentage !== null &&
                                ` (${item.percentage.toLocaleString(locale || undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)`}
                            </Text>
                          </Box>
                        </Grid.Col>
                      ))}
                    </Grid>
                  </GameCard>
                </Grid.Col>
              ),
          )}
        </Grid>
      )}
    </SpyReportShell>
  );
};

export default IntelResult;
