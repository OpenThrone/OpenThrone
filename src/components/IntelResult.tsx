import {
  faBinoculars,
  faChartPie,
  faWarehouse,
} from '@fortawesome/free-solid-svg-icons';
import { Box, Grid, Group, Progress, RingProgress, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';

import panelClasses from '@/components/game/Panels.module.css';
import { UnitTypes } from '@/constants';
import { useUser } from '@/context/users';
import type { PlayerItem, PlayerUnit } from '@/types/typings';
import { isPopulationObserved } from '@/utils/intelPopulation';
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
  const { t: tBattle } = useTranslation('battle');
  const { user } = useUser();
  const locale = user?.locale;
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const isAttackerWinner = winner === attackerPlayer.id;
  const view =
    viewerID === defenderPlayer.id
      ? 'defender'
      : viewerID === attackerPlayer.id
        ? 'attacker'
        : 'shared';

  const observedUnits = useMemo<PlayerUnit[]>(() => {
    const intel = stats.spyResults.intelligenceGathered;
    return [
      ...(Array.isArray(intel?.units) ? intel.units : []),
      // Saved reports drop isMercenary, so the list itself marks them.
      ...(Array.isArray(intel?.mercenaries)
        ? intel.mercenaries.map((unit) => ({ ...unit, isMercenary: true }))
        : []),
    ].filter((unit) => unit.quantity > 0);
  }, [stats]);
  const totalPopulation = useMemo(
    () =>
      observedUnits.reduce((total, unit) => total + Number(unit.quantity), 0),
    [observedUnits],
  );
  const hasFullIntel = stats.spyResults.intelPercentage === 100;
  const intel = stats.spyResults.intelligenceGathered;
  // Exact total population at report time (#286): public like the attack list.
  // Older stored reports have no value and keep the old sampled label.
  const exactPopulation =
    typeof intel?.population === 'number' ? intel.population : null;
  const isUnitsObserved = isPopulationObserved(intel);
  // A gathered snapshot always shows the card, even when the mission only
  // picked up troops or gear; failed missions have no snapshot (#368).
  const hasStats = Boolean(intel);

  // Every stat row renders on every report, so a lower-quality mission reads
  // as a partial view ("Not Observed"), not a shorter card (#368).
  const statRows: { key: string; label: string; value: string | null }[] =
    hasStats
      ? [
          {
            key: 'gold',
            label: t('intelReport.stats.gold'),
            value:
              intel.gold == null ? null : toLocale(Number(intel.gold), locale),
          },
          {
            key: 'goldInBank',
            label: t('intelReport.stats.goldInBank'),
            value:
              intel.goldInBank == null
                ? null
                : toLocale(Number(intel.goldInBank), locale),
          },
          {
            key: 'offense',
            label: t('intelReport.stats.offense'),
            value:
              intel.offense == null ? null : toLocale(intel.offense, locale),
          },
          {
            key: 'defense',
            label: t('intelReport.stats.defense'),
            value:
              intel.defense == null ? null : toLocale(intel.defense, locale),
          },
          {
            key: 'spyOffense',
            label: t('intelReport.stats.spyOffense'),
            value:
              intel.spyOffense == null
                ? null
                : toLocale(intel.spyOffense, locale),
          },
          {
            key: 'spyDefense',
            label: t('intelReport.stats.spyDefense'),
            value:
              intel.spyDefense == null
                ? null
                : toLocale(intel.spyDefense, locale),
          },
          {
            key: 'fortHitpoints',
            label: t('intelReport.stats.fortHitpoints'),
            value:
              intel.fortHitpoints == null
                ? null
                : toLocale(intel.fortHitpoints, locale),
          },
          {
            key: 'fortLevel',
            label: t('intelReport.stats.fortLevel'),
            value:
              intel.fortLevel == null
                ? null
                : toLocale(intel.fortLevel, locale),
          },
          {
            key: 'defenseBonus',
            label: t('intelReport.stats.defenseBonus'),
            value:
              intel.defenseBonus == null
                ? null
                : `+${toLocale(intel.defenseBonus, locale)}%`,
          },
          {
            key: 'spyLevel',
            label: t('intelReport.stats.spyLevel'),
            value:
              intel.spyLevel == null ? null : toLocale(intel.spyLevel, locale),
          },
          {
            key: 'sentryLevel',
            label: t('intelReport.stats.sentryLevel'),
            value:
              intel.sentryLevel == null
                ? null
                : toLocale(intel.sentryLevel, locale),
          },
        ]
      : [];

  const unitSegments = useMemo(() => {
    const unitColors = {
      CITIZEN: 'grey',
      WORKER: 'yellow',
      OFFENSE: 'red',
      DEFENSE: 'blue',
      SPY: 'green',
      SENTRY: 'purple',
    };

    // Name each stack and its level so several OFFENSE or DEFENSE rows read apart.
    const typeOrder = Object.keys(unitColors);
    return [...observedUnits]
      .sort(
        (a, b) =>
          typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) ||
          a.level - b.level,
      )
      .map((unit) => {
        const info = UnitTypes.find(
          (u) => u.type === unit.type && u.level === unit.level,
        );
        const nameKey = info
          ? info.name
              .replace(/\s+(\w)/g, (_, c: string) => c.toUpperCase())
              .replace(/^\w/, (c) => c.toLowerCase())
          : null;
        return {
          label: `${unit.type}`,
          name: nameKey
            ? tBattle(`units.${nameKey}`, { defaultValue: info!.name })
            : null,
          level: unit.level,
          mercenary: Boolean(unit.isMercenary),
          quantity: unit.quantity,
          part:
            totalPopulation > 0 ? (unit.quantity / totalPopulation) * 100 : 0,
          color: unitColors[unit.type] || 'black',
        };
      });
  }, [observedUnits, totalPopulation, tBattle]);

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
              ? t(`spyReport.${view}SpiesLost`, {
                  count: Number(stats.spyResults.spiesLost),
                })
              : t(`spyReport.${view}NoSpiesLost`),
          ]}
        />
      )}
      {isAttackerWinner && (
        <Grid grow gutter="md" mt="xl">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <GameCard
              title={
                exactPopulation !== null
                  ? t('intelReport.populationTitle', {
                      defaultValue: 'Population',
                    })
                  : t('intelReport.observedPopulation')
              }
              icon={faChartPie}
            >
              <Group justify="center">
                <RingProgress
                  size={170}
                  thickness={16}
                  label={
                    <Text size="xs" ta="center">
                      {exactPopulation !== null
                        ? t('intelReport.populationTotal', {
                            replace: {
                              count: toLocale(exactPopulation, locale),
                            },
                          })
                        : isUnitsObserved
                          ? t('intelReport.observedTotal', {
                              replace: {
                                count: toLocale(totalPopulation, locale),
                              },
                            })
                          : t('intelReport.notObserved', {
                              defaultValue: 'Not Observed',
                            })}
                    </Text>
                  }
                  sections={unitSegments.map((s) => ({
                    value: s.part,
                    color: s.color,
                    tooltip: `${toLocale(s.quantity, locale)} ${s.name ?? t(`intelReport.unitTypes.${s.label}`, { defaultValue: s.label })}`,
                  }))}
                />
              </Group>
              {!hasFullIntel && (
                <Text size="sm" ta="center" mt="sm">
                  {exactPopulation !== null
                    ? t('intelReport.troopsObserved', {
                        replace: {
                          observed: toLocale(totalPopulation, locale),
                          total: toLocale(exactPopulation, locale),
                          percent: Math.round(
                            Number(stats.spyResults.intelPercentage) || 0,
                          ),
                        },
                      })
                    : isUnitsObserved
                      ? t('intelReport.unobservedPopulation', {
                          percent: Math.round(
                            Number(stats.spyResults.intelPercentage) || 0,
                          ),
                        })
                      : t('intelReport.populationNotObserved', {
                          defaultValue:
                            'Population was not observed in this mission.',
                        })}
                </Text>
              )}
              {isUnitsObserved && (
                <Grid mt="md">
                  {unitSegments.map((segment, index) => (
                    <Grid.Col span={4} key={index}>
                      <Box className={panelClasses.insetRow} p="xs" ta="center">
                        <Text tt="uppercase" fz="xs" c="dimmed">
                          {t(`intelReport.unitTypes.${segment.label}`, {
                            defaultValue: segment.label,
                          })}
                        </Text>
                        {segment.name && (
                          <Text fz="xs" c="var(--ot-body)">
                            {t('intelReport.unitLevel', {
                              name: segment.name,
                              level: segment.level,
                            })}
                            {segment.mercenary &&
                              ` · ${t('intelReport.mercenary')}`}
                          </Text>
                        )}
                        <Text fw={700}>
                          {toLocale(segment.quantity, locale)}
                        </Text>
                      </Box>
                    </Grid.Col>
                  ))}
                </Grid>
              )}
            </GameCard>
          </Grid.Col>
          {hasStats && (
            <Grid.Col span={{ base: 12, md: 6 }}>
              <GameCard
                title={t('intelReport.observedStats', {
                  defaultValue: 'Kingdom Intelligence',
                })}
                icon={faBinoculars}
              >
                <Grid mt="xs">
                  {statRows.map((row) => (
                    <Grid.Col span={6} key={row.key}>
                      <Box className={panelClasses.insetRow} p="xs" ta="center">
                        <Text tt="uppercase" fz="xs" c="dimmed">
                          {row.label}
                        </Text>
                        {row.value === null ? (
                          <Text fw={700} c="dimmed">
                            {t('intelReport.notObserved', {
                              defaultValue: 'Not Observed',
                            })}
                          </Text>
                        ) : (
                          <Text fw={700}>{row.value}</Text>
                        )}
                      </Box>
                    </Grid.Col>
                  ))}
                </Grid>
                {statRows.some((row) => row.value === null) && (
                  <Text size="sm" ta="center" c="dimmed" mt="sm">
                    {t('intelReport.statsNotObserved', {
                      defaultValue:
                        'Fields marked Not Observed were missed at this intel quality.',
                    })}
                  </Text>
                )}
              </GameCard>
            </Grid.Col>
          )}
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
                    <Text size="sm" ta="center" c="dimmed">
                      {t(`intelReport.observedRoleUnits.${category.name}`, {
                        replace: { count: toLocale(category.total, locale) },
                      })}
                    </Text>
                    <Grid mt="md">
                      {category.itemsBreakdown.map((item, idx) => (
                        <Grid.Col span={4} key={idx}>
                          <Box
                            className={panelClasses.insetRow}
                            p="xs"
                            ta="center"
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
                            {item.percentage !== null && (
                              <Progress
                                mt={6}
                                size="sm"
                                value={item.percentage}
                                color={itemColors[item.type]}
                                aria-hidden
                              />
                            )}
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
