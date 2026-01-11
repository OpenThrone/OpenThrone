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
import '@/styles/global.css';

const Index = (props) => {
  const { setMeta, meta } = useLayout();
  const { status } = useSession();
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
        title: 'OpenThrone',
        description: 'Meta Description',
      });
    }
  }, [meta, setMeta]);

  useEffect(() => {
    // Don't redirect until session status is determined
    if (status === 'loading') {
      setIsRedirecting(true); // Keep showing loader while session loads
      return;
    }

    if (status === 'authenticated') {
      // User is logged in, redirect to the dashboard
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
            battles: data.battles !== undefined ? new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(Number(data.battles)) : '4.8M',
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
      <MainArea title="Open Throne">
        <Center style={{ height: '50vh' }}> {/* Adjust height as needed */}
          <Loader />
        </Center>
        </MainArea>
    );
  }
  const highlights = [
    {
      title: 'Strategic Combat',
      description: 'Build and train specialized units, then plunder rivals to climb the rankings.',
      icon: faCrown,
    },
    {
      title: 'Espionage Operations',
      description: 'Deploy spies, sabotage defenses, and strike before your enemies can react.',
      icon: faDragon,
    },
    {
      title: 'Empire Building',
      description: 'Construct fortifications, armories, and mines to strengthen your kingdom.',
      icon: faShieldHalved,
    },
  ];

  return (
    <MainArea title="Open Throne">
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
                Sign Up Now And
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
                Join the Fight!
              </Text>
              <Text mt="md" size="lg" c="gray.3">
                Choose a race, forge your class, and command a rising empire in a persistent strategy world.
              </Text>
              <Box mt="md">
                <Text size="sm" c="gray.4" component="ul" style={{ paddingLeft: '1.2rem', lineHeight: 1.7 }}>
                  <li>Choose between four unique races: Undead, Humans, Goblins, Elves.</li>
                  <li>Train citizens as workers, offensive or defensive soldiers, and spies.</li>
                  <li>Equip your army with weapons and armor.</li>
                  <li>Play with friends, create your own alliance, and dominate the realm.</li>
                  <li>Create a character profile with a custom avatar.</li>
                  <li>Stay in contact with the team via Discord.</li>
                </Text>
              </Box>
              <Group mt="xl" gap="md">
                <Button
                  component={Link}
                  href="/account/register"
                  size="md"
                  color="yellow"
                >
                  Begin Your Reign
                </Button>
                <Button
                  component={Link}
                  href="/account/login"
                  size="md"
                  variant="outline"
                  color="gray"
                >
                  Sign In
                </Button>
              </Group>
              <Group mt="md" gap="xs">
                <ThemeIcon size="sm" variant="light" color="yellow">
                  <FontAwesomeIcon icon={faBolt} />
                </ThemeIcon>
                <Text size="sm" c="dimmed">
                  Free to play, no resets, no paywalls.
                </Text>
              </Group>
            </Box>

            <Box className="public-rise public-rise-delay-1">
              <StatGrid
                title="World Stats"
                stats={[
                  { label: 'Total Players', value: worldStats.players, icon: <FontAwesomeIcon icon={faCrown} /> },
                  { label: 'Battles Fought', value: worldStats.battles, icon: <FontAwesomeIcon icon={faSkullCrossbones} /> },
                  { label: 'Alliances', value: worldStats.alliances, icon: <FontAwesomeIcon icon={faUsers} /> },
                  { label: 'Epoch', value: worldStats.epoch, icon: <FontAwesomeIcon icon={faShieldHalved} /> },
                ]}
                columns={2}
              />
            </Box>
          </SimpleGrid>
        </Box>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg" mt="xl">
          {highlights.map((item, index) => (
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
          <GameCard title="War Council Briefing" icon={faScroll}>
            <Text size="sm" c="gray.3" lh={1.7}>
              Stay current on realm updates, balance patches, and seasonal campaigns. The war room never sleeps.
            </Text>
            <Group mt="md">
              <Button component={Link} href="/community/news" size="sm" variant="light" color="yellow">
                Read the News
              </Button>
              <Button
                component="a"
                href="https://discord.gg/J2gw2xvh3R"
                size="sm"
                variant="subtle"
                color="gray"
              >
                Join the Discord
              </Button>
            </Group>
          </GameCard>

          <GameCard title="Newcomer Protocol" icon={faShieldHalved}>
            <Text size="sm" c="gray.3" lh={1.7}>
              Start with protected turns, earn daily rewards, and learn the meta at your pace. We built this realm for long-term rulers.
            </Text>
            <Group mt="md">
              <Button component={Link} href="/account/register" size="sm" color="yellow">
                Create a Commander
              </Button>
              <Button component={Link} href="/account/login" size="sm" variant="outline" color="gray">
                Return to Battle
              </Button>
            </Group>
          </GameCard>
        </SimpleGrid>

        <Box mt={50} style={{ textAlign: 'center', opacity: 0.6 }}>
          <Group justify="center" gap="xl">
             <Link href="/about" style={{ color: '#adb5bd', textDecoration: 'none', fontSize: '0.9rem' }}>
                About the Project
             </Link>
             <a href="https://github.com/OpenThrone/OpenThrone" target="_blank" rel="noreferrer" style={{ color: '#adb5bd', textDecoration: 'none', fontSize: '0.9rem' }}>
                GitHub
             </a>
          </Group>
          <Text size="xs" c="dimmed" mt="sm">
            OpenThrone is a community-driven project.
          </Text>
        </Box>
      </div>
    </MainArea>
  );
};

export default Index;
