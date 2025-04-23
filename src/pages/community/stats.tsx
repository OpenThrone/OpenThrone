import StatsTable from '@/components/statsTable';
import { InferGetStaticPropsType } from "next";
import { getTop10AttacksByTotalCasualties, getTop10TotalAttackerCasualties, getTop10TotalDefenderCasualties, getTopGoldInBank, getTopGoldOnHand, getTopPopulations, getTopRecruitsWithDisplayNames, getTopSuccessfulAttacks, getTopWealth } from '@/services/attack.service';
import { Title, Container, Grid, Text } from '@mantine/core';
import MainArea from '@/components/MainArea';

const Stats = ({ attacks, recruits, population, totalWealth, goldOnHand, goldInBank, attackByCas, attackerCas, defenderCas, lastGenerated }: InferGetStaticPropsType<typeof getStaticProps>) => {
  return (
    <MainArea
      title="Community Stats">
      <Grid>
        <Grid.Col span={{ base:12, md:6}}>
          <StatsTable title="Top 10 Population" data={population} description="The top 10 population is a list of the ten user accounts with the highest total population over a span." />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable title="Most Active Recruiters (1d)" data={recruits} />
        </Grid.Col>
        <Grid.Col span={{ base:12, md:6}}>
          <StatsTable title="Top 10 Successful Attackers (7d)" data={attacks} />
        </Grid.Col>
        <Grid.Col span={{ base:12, md:6}}>
          <StatsTable title="Top 10 Gold on Hand" data={goldOnHand} />
        </Grid.Col>
        <Grid.Col span={{ base:12, md:6}}>
          <StatsTable title="Top 10 Wealthiest Players" data={totalWealth} />
        </Grid.Col>
        <Grid.Col span={{ base:12, md:6}}>
          <StatsTable title="Top 10 Gold in Bank" data={goldInBank} />
        </Grid.Col>
        <Grid.Col span={{ base:12, md:6}}>
          <StatsTable title="Top 10 Total Attacker Casualties (7d)" data={attackerCas} />
        </Grid.Col>
        <Grid.Col span={{ base:12, md:6}}>
          <StatsTable title="Top 10 Total Defender Casualties (7d)" data={defenderCas} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable title="Top 10 Attacks by Total Casualties (7d)" data={attackByCas} displayButton={false} />
        </Grid.Col>
      </Grid>
      <Text className='text-center' mt="lg">Last generated: {new Date(lastGenerated).toLocaleString()}</Text>
    </MainArea>
  );
};

export const getStaticProps = async (context: any) => {
  // Get the current date and time
  const now = new Date();

  const totalWealth = (await getTopWealth()).map(entry => ({
    ...entry,
    gold: entry.stat.toString(),
    gold_in_bank: entry.stat.toString(),
    stat: entry.stat.toString(),
  }));

  const goldOnHand = (await getTopGoldOnHand()).map(entry => ({
    ...entry,
    gold: entry.stat.toString(),
    stat: entry.stat.toString(),
  }));

  const goldInBank = (await getTopGoldInBank()).map(entry => ({
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
      attackByCas: await getTop10AttacksByTotalCasualties(24 * 60 * 60 * 1000 * 7),
      attackerCas: await getTop10TotalAttackerCasualties(24 * 60 * 60 * 1000 * 7),
      defenderCas: await getTop10TotalDefenderCasualties(24 * 60 * 60 * 1000 * 7),
      lastGenerated: new Date().toISOString(),
    },
    revalidate: 60 * 60 * 24 + (60 * 10), // 24 hours + 10 minutes, a cron should revalidate it instead
  };
};


export default Stats;
