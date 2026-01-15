import {
  faCode,
  faExclamationTriangle,
  faInfoCircle,
  faQuestionCircle,
  faScroll,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Accordion,
  Box,
  Button,
  Group,
  List,
  SimpleGrid,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import React from 'react';

import MainArea from '@/components/MainArea';

const About = () => {
  const { t } = useTranslation('common');
  const containerStyle = {
    background: `
  linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0)) ,
  linear-gradient(135deg, rgba(34,48,66,0.95) 0%, rgba(15,20,26,0.9) 55%, rgba(8,12,18,0.95) 100%)
`,
    border: '1px solid #2f3e52',
    borderRadius: '12px',
    padding: '32px',
    position: 'relative' as const,
    overflow: 'hidden',
    boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
  };

  return (
    <MainArea title={t('about.title')}>
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        {/* Header Section */}
        <Box className="public-rise" style={containerStyle}>
          <Box
            style={{
              position: 'absolute',
              top: '-120px',
              right: '-140px',
              width: '280px',
              height: '280px',
              background:
                'radial-gradient(circle, rgba(229,197,90,0.15) 0%, rgba(229,197,90,0) 70%)',
              pointerEvents: 'none',
            }}
          />
          <Title
            order={1}
            style={{
              fontFamily: 'MedievalSharp, serif',
              color: '#f4e7b3',
              textShadow: '0 2px 4px rgba(0,0,0,0.5)',
            }}
          >
            {t('about.aboutOpenThrone')}
          </Title>
          <Text mt="md" size="lg" c="gray.3">
            {t('about.description')}
          </Text>
        </Box>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="xl">
          {/* Origin Story */}
          <Box
            className="public-rise public-rise-delay-1"
            style={containerStyle}
          >
            <Group mb="md">
              <ThemeIcon size="lg" variant="light" color="yellow">
                <FontAwesomeIcon icon={faScroll} />
              </ThemeIcon>
              <Title order={3} c="gray.1">
                {t('about.originStoryTitle')}
              </Title>
            </Group>
            <Text c="gray.4" lh={1.6}>
              {t('about.originStory')}
            </Text>
            <Text c="gray.4" mt="sm" lh={1.6}>
              {t('about.modernStack')}
            </Text>
            <Text c="gray.4" mt="sm" size="sm" fs="italic">
              {t('about.notAffiliated')}
            </Text>
            <Text c="gray.4" mt="sm" lh={1.6}>
              {t('about.serverStatus')}
            </Text>
          </Box>

          {/* Current Status */}
          <Box
            className="public-rise public-rise-delay-2"
            style={containerStyle}
          >
            <Group mb="md">
              <ThemeIcon size="lg" variant="light" color="orange">
                <FontAwesomeIcon icon={faExclamationTriangle} />
              </ThemeIcon>
              <Title order={3} c="gray.1">
                {t('about.projectStatus')}
              </Title>
            </Group>
            <Text fw={700} c="yellow.4" tt="uppercase" mb="xs">
              {t('about.preAlpha')}
              {t('about.liveDevelopment')}
            </Text>
            <Text c="gray.4" lh={1.6}>
              {t('about.serverStatus')}
            </Text>
            <List
              mt="md"
              spacing="sm"
              size="sm"
              center
              icon={
                <ThemeIcon color="yellow" size={24} radius="xl">
                  <FontAwesomeIcon icon={faInfoCircle} size="xs" />
                </ThemeIcon>
              }
            >
              <List.Item>
                <Text c="gray.4">{t('about.mayReset')}</Text>
              </List.Item>
              <List.Item>
                <Text c="gray.4">{t('about.featuresAdded')}</Text>
              </List.Item>
              <List.Item>
                <Text c="gray.4">{t('about.basicMechanics')}</Text>
              </List.Item>
            </List>
          </Box>

          {/* FAQ & Community */}

          <Box
            className="public-rise public-rise-delay-3"
            style={containerStyle}
          >
            <Group mb="md">
              <ThemeIcon size="lg" variant="light" color="blue">
                <FontAwesomeIcon icon={faQuestionCircle} />
              </ThemeIcon>
              <Title order={3} c="gray.1">
                {t('about.faq')}
              </Title>
            </Group>
            <Accordion
              variant="separated"
              radius="md"
              styles={{
                item: {
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  border: '1px solid #2f3e52',
                },
                label: { color: '#e0e0e0' },
                content: { color: '#adb5bd' },
              }}
            >
              <Accordion.Item value="active">
                <Accordion.Control>
                  {t('about.faqIsGameStillBeingDeveloped')}
                </Accordion.Control>
                <Accordion.Panel>{t('about.faqActive')}</Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="help">
                <Accordion.Control>
                  {t('about.canSuggestIdeas')}
                </Accordion.Control>
                <Accordion.Panel>{t('about.faqHelp')}</Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="ideas">
                <Accordion.Control>
                  {t('about.canSuggestIdeas')}
                </Accordion.Control>
                <Accordion.Panel>{t('about.faqIdeas')}</Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Box>

          <Box
            className="public-rise public-rise-delay-3"
            style={containerStyle}
          >
            <Group mb="md">
              <ThemeIcon size="lg" variant="light" color="grape">
                <FontAwesomeIcon icon={faUsers} />
              </ThemeIcon>
              <Title order={3} c="gray.1">
                {t('about.community')}
              </Title>
            </Group>
            <Text c="gray.4" lh={1.6}>
              {t('about.contributions')}
            </Text>

            <Group mt="xl" grow>
              <Button
                component="a"
                href="https://discord.gg/j9NYxmBCjA"
                target="_blank"
                rel="noopener noreferrer"
                size="md"
                color="indigo"
                leftSection={<FontAwesomeIcon icon={faUsers} />}
              >
                {t('about.joinDiscord')}
              </Button>
              <Button
                component="a"
                href="https://github.com/OpenThrone/OpenThrone"
                target="_blank"
                rel="noopener noreferrer"
                size="md"
                variant="outline"
                color="gray"
                leftSection={<FontAwesomeIcon icon={faCode} />}
              >
                {t('about.viewGitHub')}
              </Button>
            </Group>
          </Box>
        </SimpleGrid>

        <Box mt="xl" style={{ textAlign: 'center' }}>
          <Text c="dimmed" size="xs">
            {t('about.licensed')}
          </Text>
        </Box>
      </div>
    </MainArea>
  );
};

export default About;
