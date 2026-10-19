import { faScroll, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import {
  Box,
  Button,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Text,
  Title,
} from '@mantine/core';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import router from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useState } from 'react';

import Image from '@/components/ArtworkImage';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import PublicHero from '@/components/public/PublicHero';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { useLayout } from '@/context/LayoutContext';
import { logError, logInfo } from '@/utils/logger';
import { serverSideTranslations } from '@/utils/serverTranslations';

const Index = () => {
  const { setMeta, meta } = useLayout();
  const { status } = useSession();
  const { t } = useTranslation('landing');
  const [isRedirecting, setIsRedirecting] = useState(true);
  const [worldStats, setWorldStats] = useState({
    players: '—',
    battles: '—',
    alliances: '—',
    era: '—',
  });

  useEffect(() => {
    if (setMeta && meta && meta.title !== 'OpenThrone') {
      setMeta({
        title: t('title'),
        description: t('metaDescription'),
      });
    }
  }, [meta, setMeta, t]);

  useEffect(() => {
    // Don't redirect until session status is determined
    if (status === 'loading') {
      setIsRedirecting(true); // Keep showing loader while session loads
      return;
    }

    if (status === 'authenticated') {
      // User is logged in, redirect to dashboard
      logInfo('User authenticated, redirecting to /home/overview');
      router.replace('/home/overview');
      setIsRedirecting(true);
    } else {
      setIsRedirecting(false);
    }
  }, [status]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setWorldStats({
            players:
              data.players !== undefined
                ? Number(data.players).toLocaleString()
                : '—',
            battles:
              data.battles !== undefined
                ? new Intl.NumberFormat('en-US', {
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(Number(data.battles))
                : '—',
            alliances:
              data.alliances !== undefined
                ? Number(data.alliances).toLocaleString()
                : '—',
            era: data.era || data.epoch || '—',
          });
        }
      } catch (error) {
        logError('Failed to fetch world stats', error);
      }
    };
    fetchStats();
  }, []);

  if (status === 'loading' || (status === 'authenticated' && isRedirecting)) {
    return (
      <>
        <SeoHead title={t('title')} description={t('metaDescription')} />
        <MainArea title={t('title')}>
          <Center style={{ height: '50vh' }}>
            {' '}
            {/* Adjust height as needed */}
            <Loader />
          </Center>
        </MainArea>
      </>
    );
  }

  return (
    <>
      <SeoHead title={t('title')} description={t('metaDescription')} />
      <MainArea title={t('title')}>
        <Box className={classes.page}>
          <PublicHero
            title={t('hero.joinTheFight')}
            description={t('hero.tagline')}
          >
            <Group className={classes.actions}>
              <Button component={Link} href="/account/register" size="md">
                {t('hero.beginYourReign')}
              </Button>
              <Button
                component={Link}
                href="/account/login"
                size="md"
                variant="outline"
              >
                {t('hero.signIn')}
              </Button>
            </Group>
            <Text size="sm" c="var(--ot-muted)" mt="md">
              {t('hero.freeToPlay')}
            </Text>
          </PublicHero>
          <Box
            component="dl"
            className={classes.stats}
            aria-label={t('worldStats.title')}
          >
            {[
              { key: 'totalPlayers', value: worldStats.players },
              { key: 'battlesFought', value: worldStats.battles },
              { key: 'alliances', value: worldStats.alliances },
              { key: 'era', value: worldStats.era },
            ].map(({ key, value }) => (
              <Box key={key}>
                <dt>{t(`worldStats.${key}`)}</dt>
                <dd>{value}</dd>
              </Box>
            ))}
          </Box>

          <Box component="section" className={classes.races}>
            <Title order={2} className={classes.sectionTitle}>
              {t('races.title')}
            </Title>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mt="md">
              {[
                { src: '/assets/shields/ELF.webp', key: 'elf' },
                { src: '/assets/shields/HUMAN.webp', key: 'human' },
                { src: '/assets/shields/GOBLIN.webp', key: 'goblin' },
                { src: '/assets/shields/UNDEAD.webp', key: 'undead' },
              ].map((race) => (
                <Box key={race.key} className={classes.race}>
                  <Image
                    src={race.src}
                    alt={t(`races.${race.key}`)}
                    width={100}
                    height={100}
                    style={{ margin: '0 auto' }}
                  />
                  <Text
                    size="xs"
                    fw={600}
                    c="gray.3"
                    mt={8}
                    style={{ fontFamily: 'MedievalSharp, serif' }}
                  >
                    {t(`races.${race.key}`)}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
            <Box mt="md" style={{ textAlign: 'center' }}>
              <Button
                component={Link}
                href="/how-to-play"
                size="xs"
                variant="outline"
                color="yellow"
              >
                {t('races.learnMore')}
              </Button>
            </Box>
          </Box>

          <SimpleGrid
            cols={{ base: 1, md: 3 }}
            spacing="xl"
            className={classes.highlights}
          >
            {['strategicCombat', 'espionageOperations', 'empireBuilding'].map(
              (key) => (
                <Box component="section" key={key}>
                  <Title order={2} className={classes.highlightTitle}>
                    {t(`highlights.${key}.title`)}
                  </Title>
                  <Text className={classes.prose}>
                    {t(`highlights.${key}.description`)}
                  </Text>
                </Box>
              ),
            )}
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="xl">
            <GameCard title={t('warCouncilBriefing.title')} icon={faScroll}>
              <Text className={classes.prose}>
                {t('warCouncilBriefing.description')}
              </Text>
              <Group mt="md">
                <Button
                  component={Link}
                  href="/community/news"
                  size="sm"
                  variant="outline"
                  color="yellow"
                >
                  {t('warCouncilBriefing.readTheNews')}
                </Button>
                <Button
                  component="a"
                  href="https://discord.com/invite/j9NYxmBCjA"
                  size="sm"
                  variant="outline"
                  color="gray"
                >
                  {t('warCouncilBriefing.joinDiscord')}
                </Button>
              </Group>
            </GameCard>

            <GameCard title={t('newcomerProtocol.title')} icon={faShieldHalved}>
              <Text className={classes.prose}>
                {t('newcomerProtocol.description')}
              </Text>
              <Group mt="md">
                <Button
                  component={Link}
                  href="/account/register"
                  size="sm"
                  color="yellow"
                >
                  {t('newcomerProtocol.createCommander')}
                </Button>
                <Button
                  component={Link}
                  href="/account/login"
                  size="sm"
                  variant="outline"
                  color="gray"
                >
                  {t('newcomerProtocol.returnToBattle')}
                </Button>
              </Group>
            </GameCard>
          </SimpleGrid>

          <Box mt={40} ta="center">
            <Group justify="center" gap="xl">
              <Link
                href="/about"
                style={{
                  color: 'var(--ot-muted)',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                }}
              >
                {t('footer.aboutProject')}
              </Link>
              <a
                href="https://github.com/OpenThrone/OpenThrone"
                target="_blank"
                rel="noreferrer"
                style={{
                  color: 'var(--ot-muted)',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                }}
              >
                {t('footer.github')}
              </a>
            </Group>
            <Text size="xs" c="dimmed" mt="sm">
              {t('footer.gameTagline')}
            </Text>
          </Box>
        </Box>
      </MainArea>
    </>
  );
};

/** Returns static props for callers that need normalized game data. */
export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'landing',
    ])),
  },
});

export default Index;
