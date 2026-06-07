import {
  faChessKnight,
  faCoins,
  faCrown,
  faFistRaised,
  faHandshake,
  faShieldHalved,
  faUserShield,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Image from 'next/image';
import Link from 'next/link';
import {
  Box,
  Button,
  Group,
  SimpleGrid,
  Text,
  Title,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import React from 'react';

import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import SeoHead from '@/components/SeoHead';
import { getAssetPath } from '@/utils/utilities';

const containerStyle: React.CSSProperties = {
  background: `
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0)),
    linear-gradient(135deg, rgba(34,48,66,0.95) 0%, rgba(15,20,26,0.9) 55%, rgba(8,12,18,0.95) 100%)
  `,
  border: '1px solid #2f3e52',
  borderRadius: '12px',
  padding: '32px',
  position: 'relative',
  overflow: 'hidden',
  boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
};

const sectionCardStyle: React.CSSProperties = {
  border: '1px solid #2f3e52',
  borderRadius: '8px',
  padding: '24px',
  background: 'linear-gradient(180deg, rgba(13,17,23,0.85), rgba(3,6,8,0.95))',
  boxShadow: '0 10px 20px rgba(0,0,0,0.3)',
};

const races = ['elf', 'human', 'goblin', 'undead'] as const;
const raceShieldPaths: Record<string, string> = {
  elf: '/assets/shields/ELF.webp',
  human: '/assets/shields/HUMAN.webp',
  goblin: '/assets/shields/GOBLIN.webp',
  undead: '/assets/shields/UNDEAD.webp',
};

const HowToPlay = () => {
  const { t } = useTranslation('how-to-play');

  return (
    <>
      <SeoHead title={t('metaTitle')} description={t('metaDescription')} />
      <MainArea title={t('hero.title')}>
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <Box className="public-rise" style={containerStyle}>
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
            <Text
              size="xs"
              fw={700}
              tt="uppercase"
              c="gray.4"
              style={{ letterSpacing: '0.4em' }}
            >
              {t('hero.badge')}
            </Text>
            <Title
              order={1}
              mt="xs"
              style={{
                fontFamily: 'MedievalSharp, serif',
                color: '#f4e7b3',
                textShadow: '0 6px 18px rgba(0,0,0,0.6)',
              }}
            >
              {t('hero.title')}
            </Title>
            <Text mt="md" size="lg" c="gray.3">
              {t('hero.subtitle')}
            </Text>
          </Box>

          <Box mt="xl" className="public-rise public-rise-delay-1" style={sectionCardStyle}>
            <Group gap="xs" mb="md">
              <FontAwesomeIcon
                icon={faChessKnight}
                style={{ color: '#e5c55a', fontSize: '18px' }}
              />
              <Title
                order={2}
                style={{
                  fontFamily: 'MedievalSharp, serif',
                  color: '#f4e7b3',
                  letterSpacing: '1px',
                }}
              >
                {t('coreLoop.title')}
              </Title>
            </Group>
            <Text c="gray.3" lh={1.7} mb="lg">
              {t('coreLoop.description')}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
              {(['earn', 'attack', 'build', 'dominate'] as const).map((step) => (
                <Box
                  key={step}
                  p="md"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '6px',
                    border: '1px solid #1f2b3b',
                  }}
                >
                  <Text size="sm" fw={700} c="yellow.4" mb={4}>
                    {t(`coreLoop.steps.${step}.title`)}
                  </Text>
                  <Text size="xs" c="gray.4" lh={1.6}>
                    {t(`coreLoop.steps.${step}.text`)}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
          </Box>

          <Box mt="xl" className="public-rise public-rise-delay-2" style={sectionCardStyle}>
            <Group gap="xs" mb="md">
              <FontAwesomeIcon
                icon={faCrown}
                style={{ color: '#e5c55a', fontSize: '18px' }}
              />
              <Title
                order={2}
                style={{
                  fontFamily: 'MedievalSharp, serif',
                  color: '#f4e7b3',
                  letterSpacing: '1px',
                }}
              >
                {t('races.title')}
              </Title>
            </Group>
            <Text c="gray.3" lh={1.7} mb="lg">
              {t('races.description')}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
              {races.map((race) => (
                <Box
                  key={race}
                  p="lg"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '8px',
                    border: '1px solid #1f2b3b',
                    textAlign: 'center',
                  }}
                >
                  <Image
                    src={raceShieldPaths[race]}
                    alt={t(`races.${race}.name`)}
                    width={64}
                    height={64}
                    style={{ margin: '0 auto 12px' }}
                  />
                  <Text
                    fw={700}
                    style={{
                      fontFamily: 'MedievalSharp, serif',
                      color: '#f4e7b3',
                      fontSize: '1.1rem',
                    }}
                  >
                    {t(`races.${race}.name`)}
                  </Text>
                  <Text size="xs" c="gray.4" lh={1.6} mt={4}>
                    {t(`races.${race}.description`)}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
          </Box>

          <Box mt="xl" className="public-rise public-rise-delay-3" style={sectionCardStyle}>
            <Group gap="xs" mb="md">
              <FontAwesomeIcon
                icon={faFistRaised}
                style={{ color: '#e5c55a', fontSize: '18px' }}
              />
              <Title
                order={2}
                style={{
                  fontFamily: 'MedievalSharp, serif',
                  color: '#f4e7b3',
                  letterSpacing: '1px',
                }}
              >
                {t('army.title')}
              </Title>
            </Group>
            <Text c="gray.3" lh={1.7} mb="lg">
              {t('army.description')}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {(['workers', 'attack', 'defense', 'spies'] as const).map((unit) => (
                <Box
                  key={unit}
                  p="md"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '6px',
                    border: '1px solid #1f2b3b',
                  }}
                >
                  <Text size="sm" fw={700} c="yellow.4" mb={4}>
                    {t(`army.${unit}.title`)}
                  </Text>
                  <Text size="xs" c="gray.4" lh={1.6}>
                    {t(`army.${unit}.text`)}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
          </Box>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="xl">
            <Box className="public-rise public-rise-delay-1" style={sectionCardStyle}>
              <Group gap="xs" mb="md">
                <FontAwesomeIcon
                  icon={faCoins}
                  style={{ color: '#e5c55a', fontSize: '18px' }}
                />
                <Title
                  order={2}
                  style={{
                    fontFamily: 'MedievalSharp, serif',
                    color: '#f4e7b3',
                    letterSpacing: '1px',
                  }}
                >
                  {t('economy.title')}
                </Title>
              </Group>
              <Text c="gray.3" lh={1.7} mb="md">
                {t('economy.description')}
              </Text>
              {(['bank', 'armory', 'fortifications', 'mines'] as const).map(
                (building) => (
                  <Box
                    key={building}
                    py="xs"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <Text size="sm" fw={600} c="gray.2">
                      {t(`economy.${building}.title`)}
                    </Text>
                    <Text size="xs" c="gray.5" lh={1.5}>
                      {t(`economy.${building}.text`)}
                    </Text>
                  </Box>
                ),
              )}
            </Box>

            <Box className="public-rise public-rise-delay-2" style={sectionCardStyle}>
              <Group gap="xs" mb="md">
                <FontAwesomeIcon
                  icon={faShieldHalved}
                  style={{ color: '#e5c55a', fontSize: '18px' }}
                />
                <Title
                  order={2}
                  style={{
                    fontFamily: 'MedievalSharp, serif',
                    color: '#f4e7b3',
                    letterSpacing: '1px',
                  }}
                >
                  {t('combat.title')}
                </Title>
              </Group>
              <Text c="gray.3" lh={1.7} mb="md">
                {t('combat.description')}
              </Text>
              {(['attack', 'defense', 'spy'] as const).map((action) => (
                <Box
                  key={action}
                  py="xs"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <Text size="sm" fw={600} c="gray.2">
                    {t(`combat.${action}.title`)}
                  </Text>
                  <Text size="xs" c="gray.5" lh={1.5}>
                    {t(`combat.${action}.text`)}
                  </Text>
                </Box>
              ))}
            </Box>
          </SimpleGrid>

          <Box mt="xl" className="public-rise public-rise-delay-3" style={sectionCardStyle}>
            <Group gap="xs" mb="md">
              <FontAwesomeIcon
                icon={faHandshake}
                style={{ color: '#e5c55a', fontSize: '18px' }}
              />
              <Title
                order={2}
                style={{
                  fontFamily: 'MedievalSharp, serif',
                  color: '#f4e7b3',
                  letterSpacing: '1px',
                }}
              >
                {t('alliances.title')}
              </Title>
            </Group>
            <Text c="gray.3" lh={1.7}>
              {t('alliances.description')}
            </Text>
          </Box>

          <Box mt="xl" style={{ textAlign: 'center' }}>
            <Group justify="center" gap="md">
              <Button
                component={Link}
                href="/account/register"
                size="lg"
                color="yellow"
                leftSection={<FontAwesomeIcon icon={faUserShield} />}
              >
                {t('cta.createCommander')}
              </Button>
              <Button
                component={Link}
                href="/account/login"
                size="lg"
                variant="outline"
                color="gray"
              >
                {t('cta.returnToBattle')}
              </Button>
            </Group>
          </Box>
        </div>
      </MainArea>
    </>
  );
};

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'how-to-play',
    ])),
  },
});

export default HowToPlay;
