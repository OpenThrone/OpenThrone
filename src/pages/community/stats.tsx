import StatsTable from '@/components/statsTable';
import { InferGetStaticPropsType } from "next";
import { getTop10AttacksByTotalCasualties, getTop10TotalAttackerCasualties, getTop10TotalDefenderCasualties, getTopGoldInBank, getTopGoldOnHand, getTopPopulations, getTopRecruitsWithDisplayNames, getTopSuccessfulAttacks, getTopWealth } from '@/services/attack.service';
import { Title, Container, Grid, Text } from '@mantine/core';

const Stats = ({ attacks, recruits, population, totalWealth, goldOnHand, goldInBank, attackByCas, attackerCas, defenderCas, lastGenerated }: InferGetStaticPropsType<typeof getStaticProps>) => {
  return (
    <Container>
      <Title order={2} align="center" my="md">Community Stats</Title>
      <Grid>
        <Grid.Col span={{ base:12, md:6}}>
          <StatsTable title="Top 10 Population" data={population} description="The top 10 population is a list of the ten user accounts with the highest total population over a span." />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <StatsTable title="Most Active Recruiters in last 1 day" data={recruits} />
        </Grid.Col>
        <Grid.Col span={{ base:12, md:6}}>
          <StatsTable title="Top 10 Successful Attackers in last 7 days" data={attacks} />
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
          <StatsTable title="Top 10 Attacks by Total Casualties in last 7 days" data={attackByCas} />
        </Grid.Col>
        <Grid.Col span={{ base:12, md:6}}>
          <StatsTable title="Top 10 Total Attacker Casualties in last 7 days" data={attackerCas} />
        </Grid.Col>
        <Grid.Col span={{ base:12, md:6}}>
          <StatsTable title="Top 10 Total Defender Casualties in last 7 days" data={defenderCas} />
        </Grid.Col>
      </Grid>
      <Text align="center" mt="lg">Last generated: {new Date(lastGenerated).toLocaleString()}</Text>
    </Container>
  );
};

export const getStaticProps = async (context: any) => {
  
  return {
    props: {
      totalWealth: await getTopWealth(),
      goldOnHand: await getTopGoldOnHand(),
      goldInBank: await getTopGoldInBank(),
      attacks: await getTopSuccessfulAttacks(),
      recruits: await getTopRecruitsWithDisplayNames(),
      population: await getTopPopulations(),
      attackByCas: await getTop10AttacksByTotalCasualties(24 * 60 * 60 * 1000 * 7),
      attackerCas: await getTop10TotalAttackerCasualties(24 * 60 * 60 * 1000 * 7),
      defenderCas: await getTop10TotalDefenderCasualties(24 * 60 * 60 * 1000 * 7),
      lastGenerated: new Date().toISOString(),
    },
    revalidate: 120, // Revalidate every 10 minutes
  };
};


export default Stats;
