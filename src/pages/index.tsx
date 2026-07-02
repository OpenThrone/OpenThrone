import {
  faBolt,
  faCrown,
  faDragon,
  faScroll,
  faShieldHalved,
  faSkullCrossbones,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Box,
  Button,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Text,
  ThemeIcon,
} from '@mantine/core';
import Image from 'next/image';
import Link from 'next/link';
import router from 'next/router';
import { useSession } from 'next-auth/react';
import { useTranslation } from 'next-i18next';
import type { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import React, { useEffect, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import { StatGrid } from '@/components/game/StatGrid';
import MainArea from '@/components/MainArea';
import SeoHead from '@/components/SeoHead';
import { useLayout } from '@/context/LayoutContext';
import { logError, logInfo } from '@/utils/logger';

const Index = () => {
  const { setMeta, meta } = useLayout();
  const { status } = useSession();
  const { t } = useTranslation('landing');
  const [isRedirecting, setIsRedirecting] = useState(true);
  const [worldStats, setWorldStats] = useState({
    players: '1,200+',
    battles: '4.8M',
    alliances: '312',
    epoch: 'Era VIII',
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
                : '1,200+',
            battles:
              data.battles !== undefined
                ? new Intl.NumberFormat('en-US', {
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(Number(data.battles))
                : '4.8M',
            alliances:
              data.alliances !== undefined
                ? Number(data.alliances).toLocaleString()
                : '312',
            epoch: data.epoch || 'Era VIII',
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
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <Box
          className="public-rise"
          style={{
            background:
              'linear-gradient(135deg, rgba(34,48,66,0.95) 0%, rgba(15,20,26,0.9) 55%, rgba(8,12,18,0.95) 100%)',
            border: '1px solid #2f3e52',
            borderRadius: '12px',
            padding: '32px',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
          }}
        >
          <Box
            style={{
              position: 'absolute',
              top: '-120px',
              right: '-140px',
              width: '280px',
              height: '280px',
              background:
                'radial-gradient(circle, rgba(229,197,90,0.22) 0%, rgba(229,197,90,0) 70%)',
              pointerEvents: 'none',
            }}
          />
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Box>
              <Text
                size="xs"
                fw={700}
                tt="uppercase"
                c="gray.4"
                style={{ letterSpacing: '0.4em' }}
              >
                {t('hero.signUpNowAnd')}
              </Text>
              <Text
                mt="sm"
                style={{
                  fontFamily: 'MedievalSharp, serif',
                  fontSize: '2.5rem',
                  textTransform: 'uppercase',
                  color: '#f4e7b3',
                  textShadow: '0 6px 18px rgba(0,0,0,0.6)',
                }}
              >
                {t('hero.joinTheFight')}
              </Text>
              <Text mt="md" size="lg" c="gray.3">
                {t('hero.tagline')}
              </Text>
              <Box mt="md">
                <Text
                  size="sm"
                  c="gray.4"
                  component="ul"
                  style={{ paddingLeft: '1.2rem', lineHeight: 1.7 }}
                >
                  <li>{t('hero.features.chooseRace')}</li>
                  <li>{t('hero.features.trainCitizens')}</li>
                  <li>{t('hero.features.equipArmy')}</li>
                  <li>{t('hero.features.playWithFriends')}</li>
                  <li>{t('hero.features.createProfile')}</li>
                  <li>{t('hero.features.stayInTouch')}</li>
                </Text>
              </Box>
              <Group mt="xl" gap="md">
                <Button
                  component={Link}
                  href="/account/register"
                  size="md"
                  color="yellow"
                >
                  {t('hero.beginYourReign')}
                </Button>
                <Button
                  component={Link}
                  href="/account/login"
                  size="md"
                  variant="outline"
                  color="gray"
                >
                  {t('hero.signIn')}
                </Button>
              </Group>
              <Group mt="md" gap="xs">
                <ThemeIcon size="sm" variant="light" color="yellow">
                  <FontAwesomeIcon icon={faBolt} />
                </ThemeIcon>
                <Text size="sm" c="dimmed">
                  {t('hero.freeToPlay')}
                </Text>
              </Group>
            </Box>

            <Box className="public-rise public-rise-delay-1">
              <StatGrid
                title={t('worldStats.title')}
                stats={[
                  {
                    label: t('worldStats.totalPlayers'),
                    value: worldStats.players,
                    icon: <FontAwesomeIcon icon={faCrown} />,
                  },
                  {
                    label: t('worldStats.battlesFought'),
                    value: worldStats.battles,
                    icon: <FontAwesomeIcon icon={faSkullCrossbones} />,
                  },
                  {
                    label: t('worldStats.alliances'),
                    value: worldStats.alliances,
                    icon: <FontAwesomeIcon icon={faUsers} />,
                  },
                  {
                    label: t('worldStats.epoch'),
                    value: worldStats.epoch,
                    icon: <FontAwesomeIcon icon={faShieldHalved} />,
                  },
                ]}
                columns={2}
              />
            </Box>
          </SimpleGrid>
        </Box>

        <Box
          className="public-rise public-rise-delay-1"
          mt="xl"
          style={{
            border: '1px solid #2f3e52',
            borderRadius: '12px',
            padding: '24px',
            background: 'linear-gradient(180deg, rgba(13,17,23,0.85), rgba(3,6,8,0.95))',
            boxShadow: '0 10px 20px rgba(0,0,0,0.3)',
          }}
        >
          <Text
            ta="center"
            size="xs"
            fw={700}
            tt="uppercase"
            c="gray.4"
            style={{ letterSpacing: '0.4em' }}
          >
            {t('races.title')}
          </Text>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mt="md">
            {[
              { src: '/assets/shields/ELF.webp', key: 'elf' },
              { src: '/assets/shields/HUMAN.webp', key: 'human' },
              { src: '/assets/shields/GOBLIN.webp', key: 'goblin' },
              { src: '/assets/shields/UNDEAD.webp', key: 'undead' },
            ].map((race) => (
              <Box
                key={race.key}
                style={{
                  textAlign: 'center',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid #1f2b3b',
                }}
              >
                <Image
                  src={race.src}
                  alt={t(`races.${race.key}`)}
                  width={56}
                  height={56}
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
              variant="subtle"
              color="yellow"
            >
              {t('races.learnMore')}
            </Button>
          </Box>
        </Box>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg" mt="xl">
          {[
            {
              title: t('highlights.strategicCombat.title'),
              description: t('highlights.strategicCombat.description'),
              icon: faCrown,
            },
            {
              title: t('highlights.espionageOperations.title'),
              description: t('highlights.espionageOperations.description'),
              icon: faDragon,
            },
            {
              title: t('highlights.empireBuilding.title'),
              description: t('highlights.empireBuilding.description'),
              icon: faShieldHalved,
            },
          ].map((item, index) => (
            <div
              key={item.title}
              className={`public-rise ${index === 0 ? 'public-rise-delay-1' : index === 1 ? 'public-rise-delay-2' : 'public-rise-delay-3'}`}
            >
              <GameCard title={item.title} icon={item.icon} goldAccent={false}>
                <Text size="sm" c="gray.3" lh={1.6}>
                  {item.description}
                </Text>
              </GameCard>
            </div>
          ))}
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="xl">
          <GameCard title={t('warCouncilBriefing.title')} icon={faScroll}>
            <Text size="sm" c="gray.3" lh={1.7}>
              {t('warCouncilBriefing.description')}
            </Text>
            <Group mt="md">
              <Button
                component={Link}
                href="/community/news"
                size="sm"
                variant="light"
                color="yellow"
              >
                {t('warCouncilBriefing.readTheNews')}
              </Button>
              <Button
                component="a"
                href="https://discord.gg/J2gw2xvh3R"
                size="sm"
                variant="subtle"
                color="gray"
              >
                {t('warCouncilBriefing.joinDiscord')}
              </Button>
            </Group>
          </GameCard>

          <GameCard title={t('newcomerProtocol.title')} icon={faShieldHalved}>
            <Text size="sm" c="gray.3" lh={1.7}>
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

        <Box mt={50} style={{ textAlign: 'center', opacity: 0.6 }}>
          <Group justify="center" gap="xl">
            <Link
              href="/about"
              style={{
                color: '#adb5bd',
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
                color: '#adb5bd',
                textDecoration: 'none',
                fontSize: '0.9rem',
              }}
            >
              {t('footer.github')}
            </a>
          </Group>
          <Text size="xs" c="dimmed" mt="sm">
            {t('footer.communityDriven')}
          </Text>
        </Box>
      </div>
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
