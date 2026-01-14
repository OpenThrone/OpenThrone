import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import router from 'next/router';

import { Box, Button, Center, Group, Loader, SimpleGrid, Text, ThemeIcon } from '@mantine/core';
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
import { useSession } from 'next-auth/react';

import MainArea from '@/components/MainArea';
import { GameCard } from '@/components/game/GameCard';
import { StatGrid } from '@/components/game/StatGrid';
import { useLayout } from '@/context/LayoutContext';
import { useTranslation } from 'next-i18next';

const Index = (props) => {
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
      console.log("User authenticated, redirecting to /home/overview");
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
            players: data.players !== undefined ? Number(data.players).toLocaleString() : '1,200+',
            battles: data.battles !== undefined ? new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits:1 }).format(Number(data.battles)) : '4.8M',
            alliances: data.alliances !== undefined ? Number(data.alliances).toLocaleString() : '312',
            epoch: data.epoch || 'Era VIII',
          });
        }
      } catch (error) {
        console.error('Failed to fetch world stats', error);
      }
    };
    fetchStats();
  }, []);

  if (status === 'loading' || (status === 'authenticated' && isRedirecting)) {
    return (
      <MainArea title={t('title')}>
        <Center style={{ height: '50vh' }}> {/* Adjust height as needed */}
          <Loader />
        </Center>
        </MainArea>
    );
  }

  return (
    <MainArea title={t('title')}>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 app-bg">
        <Box
          className="public-rise"
          style={{
            background: 'linear-gradient(135deg, rgba(34,48,66,0.95) 0%, rgba(15,20,26,0.9) 55%, rgba(8,12,18,0.95) 100%)',
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
              background: 'radial-gradient(circle, rgba(229,197,90,0.22) 0%, rgba(229,197,90,0) 70%)',
              pointerEvents: 'none',
            }}
          />
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Box>
              <Text size="xs" fw={700} tt="uppercase" c="gray.4" style={{ letterSpacing: '0.4em' }}>
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
                <Text size="sm" c="gray.4" component="ul" style={{ paddingLeft: '1.2rem', lineHeight: 1.7 }}>
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
                  { label: t('worldStats.totalPlayers'), value: worldStats.players, icon: <FontAwesomeIcon icon={faCrown} /> },
                  { label: t('worldStats.battlesFought'), value: worldStats.battles, icon: <FontAwesomeIcon icon={faSkullCrossbones} /> },
                  { label: t('worldStats.alliances'), value: worldStats.alliances, icon: <FontAwesomeIcon icon={faUsers} /> },
                  { label: t('worldStats.epoch'), value: worldStats.epoch, icon: <FontAwesomeIcon icon={faShieldHalved} /> },
                ]}
                columns={2}
              />
            </Box>
          </SimpleGrid>
        </Box>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg" mt="xl">
          {[
            { title: t('highlights.strategicCombat.title'), description: t('highlights.strategicCombat.description'), icon: faCrown },
            { title: t('highlights.espionageOperations.title'), description: t('highlights.espionageOperations.description'), icon: faDragon },
            { title: t('highlights.empireBuilding.title'), description: t('highlights.empireBuilding.description'), icon: faShieldHalved },
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
              <Button component={Link} href="/community/news" size="sm" variant="light" color="yellow">
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
              <Button component={Link} href="/account/register" size="sm" color="yellow">
                {t('newcomerProtocol.createCommander')}
              </Button>
              <Button component={Link} href="/account/login" size="sm" variant="outline" color="gray">
                {t('newcomerProtocol.returnToBattle')}
              </Button>
            </Group>
          </GameCard>
        </SimpleGrid>

        <Box mt={50} style={{ textAlign: 'center', opacity: 0.6 }}>
          <Group justify="center" gap="xl">
             <Link href="/about" style={{ color: '#adb5bd', textDecoration: 'none', fontSize: '0.9rem' }}>
                {t('footer.aboutProject')}
             </Link>
             <a href="https://github.com/OpenThrone/OpenThrone" target="_blank" rel="noreferrer" style={{ color: '#adb5bd', textDecoration: 'none', fontSize: '0.9rem' }}>
                {t('footer.github')}
             </a>
          </Group>
          <Text size="xs" c="dimmed" mt="sm">
            {t('footer.communityDriven')}
          </Text>
        </Box>
      </div>
    </MainArea>
  );
};

export default Index;
