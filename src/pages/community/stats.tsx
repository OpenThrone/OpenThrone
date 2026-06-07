import { Grid, Text } from '@mantine/core';
import type { InferGetStaticPropsType } from 'next';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

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
import { logError } from '@/utils/logger';

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
  lastGenerated,
}: InferGetStaticPropsType<typeof getStaticProps>) => {
  const { t } = useTranslation('community');
  return (
    <>
      <SeoHead
        title={t('stats.title')}
        description={t('stats.description')}
      />
      <MainArea title={t('stats.title')}>
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.top10Population')}
            data={population}
            description={t('stats.top10PopulationDescription')}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable title={t('stats.mostActiveRecruiters')} data={recruits} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.top10SuccessfulAttackers')}
            data={attacks}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable title={t('stats.top10GoldOnHand')} data={goldOnHand} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.top10WealthiestPlayers')}
            data={totalWealth}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable title={t('stats.top10GoldInBank')} data={goldInBank} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.top10TotalAttackerCasualties')}
            data={attackerCas}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.top10TotalDefenderCasualties')}
            data={defenderCas}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable
            title={t('stats.top10AttacksByTotalCasualties')}
            data={attackByCas}
            displayButton={false}
          />
        </Grid.Col>
      </Grid>
      <Text className="text-center" mt="lg">
        {t('stats.lastGenerated')} {new Date(lastGenerated).toLocaleString()}
      </Text>
    </MainArea>
    </>
  );
};

export const getStaticProps = async (context: any) => {
  const i18nProps = await serverSideTranslations(context.locale ?? 'en', [
    'common',
    'navigation',
    'community',
  ]);
  try {
    const totalWealth = (await getTopWealth()).map((entry) => ({
      ...entry,
      gold: entry.stat.toString(),
      gold_in_bank: entry.stat.toString(),
      stat: entry.stat.toString(),
    }));

    const goldOnHand = (await getTopGoldOnHand()).map((entry) => ({
      ...entry,
      gold: entry.stat.toString(),
      stat: entry.stat.toString(),
    }));

    const goldInBank = (await getTopGoldInBank()).map((entry) => ({
      ...entry,
      gold_in_bank: entry.stat.toString(),
      stat: entry.stat.toString(),
    }));

    return {
      props: {
        totalWealth,
        goldOnHand,
        goldInBank,
        attacks: await getTopSuccessfulAttacks(),
        recruits: await getTopRecruitsWithDisplayNames(),
        population: await getTopPopulations(),
        attackByCas: await getTop10AttacksByTotalCasualties(
          24 * 60 * 60 * 1000 * 7,
        ),
        attackerCas: await getTop10TotalAttackerCasualties(
          24 * 60 * 60 * 1000 * 7,
        ),
        defenderCas: await getTop10TotalDefenderCasualties(
          24 * 60 * 60 * 1000 * 7,
        ),
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
        lastGenerated: new Date().toISOString(),
        ...i18nProps,
      },
      revalidate: 60 * 5,
    };
  }
};

export default Stats;
