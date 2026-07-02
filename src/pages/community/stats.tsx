import { Alert, Grid, Loader, Tabs, Text } from '@mantine/core';
import type { GetStaticPropsContext, InferGetStaticPropsType } from 'next';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';

import MainArea from '@/components/MainArea';
import SeoHead from '@/components/SeoHead';
import StatsTable from '@/components/statsTable';
import {
  getTop10AttacksByTotalCasualties,
  getTop10TotalAttackerCasualties,
  getTop10TotalDefenderCasualties,
  getTopGoldInBank,
  getTopGoldOnHand,
  getTopPopulations,
  getTopRecruitsWithDisplayNames,
  getTopSuccessfulAttacks,
  getTopWealth,
} from '@/services/AttackDataService';
import {
  type EraTabOption,
  getPublicEraTabs,
  type HistoricalEraStatsPayload,
} from '@/services/UserEraStats.service';
import { logError } from '@/utils/logger';

type StatsProps = InferGetStaticPropsType<typeof getStaticProps>;

type CurrentStatsGridData = Pick<
  StatsProps,
  'population' | 'recruits' | 'goldOnHand' | 'totalWealth' | 'goldInBank'
> & {
  successfulAttacks: StatsProps['attacks'];
  attackerCasualties: StatsProps['attackerCas'];
  defenderCasualties: StatsProps['defenderCas'];
  attackByCasualties: StatsProps['attackByCas'];
};

type StatsGridProps =
  | {
      data: CurrentStatsGridData;
      mode: 'current';
    }
  | {
      data: HistoricalEraStatsPayload;
      era?: EraTabOption;
      mode: 'historical';
    };

const getSelectedEraFromQuery = (
  eraQuery: string | string[] | undefined,
  eras: EraTabOption[],
) => {
  if (typeof eraQuery !== 'string') {
    return 'current';
  }

  return eras.some((era) => !era.isCurrent && String(era.id) === eraQuery)
    ? eraQuery
    : 'current';
};

const StatsGrid = ({ data, mode }: StatsGridProps) => {
  const { t } = useTranslation('community');
  if (mode === 'historical') {
    return (
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable title={t('stats.finalStanding')} data={data.standings} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable title={t('stats.top10Offense')} data={data.offense} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable title={t('stats.top10Defense')} data={data.defense} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable title={t('stats.top10Spy')} data={data.spy} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable title={t('stats.top10Sentry')} data={data.sentry} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.mostActiveRecruiters')}
            data={data.recruits}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.top10SuccessfulAttackers')}
            data={data.attacks}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.top10GoldOnHand')}
            data={data.goldOnHand}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.top10GoldInBank')}
            data={data.goldInBank}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.top10TotalAttackerCasualties')}
            data={data.attackerCas}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.top10TotalDefenderCasualties')}
            data={data.defenderCas}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.top10AttacksByTotalCasualties')}
            data={data.attackByCas}
            displayButton={false}
          />
        </Grid.Col>
      </Grid>
    );
  }

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <StatsTable
          title={t('stats.top10Population')}
          data={data.population}
          description={t('stats.top10PopulationDescription')}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <StatsTable
          title={t('stats.mostActiveRecruiters')}
          data={data.recruits}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <StatsTable
          title={t('stats.top10SuccessfulAttackers')}
          data={data.successfulAttacks}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <StatsTable title={t('stats.top10GoldOnHand')} data={data.goldOnHand} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <StatsTable
          title={t('stats.top10WealthiestPlayers')}
          data={data.totalWealth}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <StatsTable title={t('stats.top10GoldInBank')} data={data.goldInBank} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <StatsTable
          title={t('stats.top10TotalAttackerCasualties')}
          data={data.attackerCasualties}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <StatsTable
          title={t('stats.top10TotalDefenderCasualties')}
          data={data.defenderCasualties}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <StatsTable
          title={t('stats.top10AttacksByTotalCasualties')}
          data={data.attackByCasualties}
          displayButton={false}
        />
      </Grid.Col>
    </Grid>
  );
};

const Stats = ({
  attacks,
  recruits,
  population,
  totalWealth,
  goldOnHand,
  goldInBank,
  attackByCas,
  attackerCas,
  defenderCas,
  eras,
  lastGenerated,
}: InferGetStaticPropsType<typeof getStaticProps>) => {
  const { t } = useTranslation('community');
  const router = useRouter();
  const [selectedEra, setSelectedEra] = useState<string>(() =>
    getSelectedEraFromQuery(router.query.era, eras),
  );
  const [historicalData, setHistoricalData] =
    useState<HistoricalEraStatsPayload | null>(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState(false);
  const historicalEras = eras.filter((era) => !era.isCurrent);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const nextEra = getSelectedEraFromQuery(router.query.era, eras);
    setSelectedEra((currentEra) =>
      currentEra === nextEra ? currentEra : nextEra,
    );
  }, [eras, router.isReady, router.query.era]);

  useEffect(() => {
    if (selectedEra === 'current') {
      setHistoricalData(null);
      setHistoricalError(false);
      setHistoricalLoading(false);
      return;
    }

    let cancelled = false;

    const fetchHistoricalStats = async () => {
      setHistoricalLoading(true);
      setHistoricalError(false);
      setHistoricalData(null);

      try {
        const response = await fetch(
          `/api/community/stats/history?eraId=${encodeURIComponent(selectedEra)}`,
        );

        if (!response.ok) {
          if (!cancelled) {
            setHistoricalError(true);
            setHistoricalData(null);
          }
          return;
        }

        const data: HistoricalEraStatsPayload = await response.json();

        if (!cancelled) {
          setHistoricalData(data);
        }
      } catch (error) {
        logError('Failed to fetch historical era stats', error);

        if (!cancelled) {
          setHistoricalError(true);
          setHistoricalData(null);
        }
      } finally {
        if (!cancelled) {
          setHistoricalLoading(false);
        }
      }
    };

    fetchHistoricalStats().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedEra]);

  const handleTabChange = (value: string | null) => {
    if (!value) {
      return;
    }

    setSelectedEra(value);
    router
      .push(
        {
          pathname: '/community/stats',
          query: value === 'current' ? {} : { era: value },
        },
        undefined,
        { shallow: true },
      )
      .catch(() => undefined);
  };

  return (
    <>
      <SeoHead title={t('stats.title')} description={t('stats.description')} />
      <MainArea title={t('stats.title')}>
        <Tabs value={selectedEra} onChange={handleTabChange} variant="outline">
          <Tabs.List className="overflow-x-auto whitespace-nowrap" mb="lg">
            <Tabs.Tab value="current">{t('stats.currentEra')}</Tabs.Tab>
            {historicalEras.map((era) => (
              <Tabs.Tab key={era.id} value={String(era.id)}>
                {era.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>

          <Tabs.Panel value="current">
            <StatsGrid
              data={{
                attackByCasualties: attackByCas,
                attackerCasualties: attackerCas,
                defenderCasualties: defenderCas,
                goldInBank,
                goldOnHand,
                population,
                recruits,
                successfulAttacks: attacks,
                totalWealth,
              }}
              mode="current"
            />
          </Tabs.Panel>

          {selectedEra !== 'current' && (
            <Tabs.Panel value={selectedEra}>
              {historicalLoading ? <Loader /> : null}
              {historicalError ? (
                <Alert color="red">{t('stats.failedEraStats')}</Alert>
              ) : null}
              {!historicalLoading && !historicalError && historicalData ? (
                <>
                  <Text size="xs" c="dimmed" mb="sm">
                    {t('stats.historicalStatsNotice')}
                  </Text>
                  <StatsGrid
                    data={historicalData}
                    era={historicalData.era}
                    mode="historical"
                  />
                </>
              ) : null}
            </Tabs.Panel>
          )}
        </Tabs>
        <Text className="text-center" mt="lg">
          {t('stats.lastGenerated')} {new Date(lastGenerated).toLocaleString()}
        </Text>
      </MainArea>
    </>
  );
};

export const getStaticProps = async (context: GetStaticPropsContext) => {
  const i18nProps = await serverSideTranslations(context.locale ?? 'en', [
    'common',
    'navigation',
    'community',
  ]);
  try {
    const sevenDaysMs = 24 * 60 * 60 * 1000 * 7;
    const [
      totalWealthRaw,
      goldOnHandRaw,
      goldInBankRaw,
      attacks,
      recruits,
      population,
      attackByCas,
      attackerCas,
      defenderCas,
      eras,
    ] = await Promise.all([
      getTopWealth(),
      getTopGoldOnHand(),
      getTopGoldInBank(),
      getTopSuccessfulAttacks(),
      getTopRecruitsWithDisplayNames(),
      getTopPopulations(),
      getTop10AttacksByTotalCasualties(sevenDaysMs),
      getTop10TotalAttackerCasualties(sevenDaysMs),
      getTop10TotalDefenderCasualties(sevenDaysMs),
      getPublicEraTabs(),
    ]);

    const totalWealth = totalWealthRaw.map((entry) => ({
      ...entry,
      gold: entry.stat.toString(),
      gold_in_bank: entry.stat.toString(),
      stat: entry.stat.toString(),
    }));
    const goldOnHand = goldOnHandRaw.map((entry) => ({
      ...entry,
      gold: entry.stat.toString(),
      stat: entry.stat.toString(),
    }));
    const goldInBank = goldInBankRaw.map((entry) => ({
      ...entry,
      gold_in_bank: entry.stat.toString(),
      stat: entry.stat.toString(),
    }));

    return {
      props: {
        totalWealth,
        goldOnHand,
        goldInBank,
        attacks,
        recruits,
        population,
        attackByCas,
        attackerCas,
        defenderCas,
        eras,
        lastGenerated: new Date().toISOString(),
        ...i18nProps,
      },
      revalidate: 60 * 60 * 24 + 60 * 10, // 24 hours + 10 minutes, a cron should revalidate it instead
    };
  } catch (error) {
    logError(
      'Stats getStaticProps failed; returning empty data for build',
      error,
    );
    return {
      props: {
        totalWealth: [],
        goldOnHand: [],
        goldInBank: [],
        attacks: [],
        recruits: [],
        population: [],
        attackByCas: [],
        attackerCas: [],
        defenderCas: [],
        eras: [],
        lastGenerated: new Date().toISOString(),
        ...i18nProps,
      },
      revalidate: 60 * 5,
    };
  }
};

export default Stats;
