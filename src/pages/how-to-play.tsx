import { Box, Button, Group, SimpleGrid, Text, Title } from '@mantine/core';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import Image from '@/components/ArtworkImage';
import frameClasses from '@/components/game/FantasyFrame.module.css';
import MainArea from '@/components/MainArea';
import PublicHero from '@/components/public/PublicHero';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { serverSideTranslations } from '@/utils/serverTranslations';

const sections = [
  'coreLoop',
  'races',
  'army',
  'economy',
  'combat',
  'alliances',
] as const;
const races = ['elf', 'human', 'goblin', 'undead'] as const;

const HowToPlay = () => {
  const { t } = useTranslation('how-to-play');
  return (
    <>
      <SeoHead title={t('metaTitle')} description={t('metaDescription')} />
      <MainArea title={t('hero.title')}>
        <Box className={classes.page}>
          <PublicHero
            title={t('hero.title')}
            description={t('hero.subtitle')}
            imageSrc="/assets/images/ui/public/war-table.webp"
          />
          <Box className={classes.guideLayout}>
            <Box
              component="nav"
              aria-label={t('hero.title')}
              className={`${classes.guideNav} ${frameClasses.surface} ${frameClasses.ornate}`}
            >
              {sections.map((section) => (
                <Button
                  key={section}
                  component="a"
                  href={`#${section}`}
                  variant="subtle"
                  justify="flex-start"
                  fullWidth
                >
                  {t(`${section}.title`)}
                </Button>
              ))}
            </Box>
            <Box className={classes.guideContent}>
              <Box
                component="section"
                id="coreLoop"
                className={classes.guideSection}
              >
                <Title order={2} className={classes.sectionTitle}>
                  {t('coreLoop.title')}
                </Title>
                <Text className={classes.prose}>
                  {t('coreLoop.description')}
                </Text>
                <ol className={classes.guideSteps}>
                  {['earn', 'attack', 'build', 'dominate'].map((step) => (
                    <li key={step}>
                      <Title order={3} className={classes.highlightTitle}>
                        {t(`coreLoop.steps.${step}.title`)}
                      </Title>
                      <Text className={classes.prose}>
                        {t(`coreLoop.steps.${step}.text`)}
                      </Text>
                    </li>
                  ))}
                </ol>
              </Box>
              <Box
                component="section"
                id="races"
                className={classes.guideSection}
              >
                <Title order={2} className={classes.sectionTitle}>
                  {t('races.title')}
                </Title>
                <Text className={classes.prose}>{t('races.description')}</Text>
                <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl" mt="xl">
                  {races.map((race) => (
                    <Box key={race} className={classes.raceEntry}>
                      <Image
                        src={`/assets/shields/${race.toUpperCase()}_150x150.webp`}
                        alt=""
                        width={72}
                        height={80}
                      />
                      <Box>
                        <Title order={3} className={classes.highlightTitle}>
                          {t(`races.${race}.name`)}
                        </Title>
                        <Text className={classes.prose}>
                          {t(`races.${race}.description`)}
                        </Text>
                      </Box>
                    </Box>
                  ))}
                </SimpleGrid>
                <Text className={classes.prose} mt="xl">
                  {t('races.matchups')}
                </Text>
              </Box>
              {[
                {
                  key: 'army',
                  entries: ['workers', 'attack', 'defense', 'spies'],
                },
                {
                  key: 'economy',
                  entries: ['bank', 'armory', 'fortifications', 'mines'],
                },
                { key: 'combat', entries: ['attack', 'defense', 'spy'] },
              ].map(({ key, entries }) => (
                <Box
                  component="section"
                  id={key}
                  key={key}
                  className={classes.guideSection}
                >
                  <Title order={2} className={classes.sectionTitle}>
                    {t(`${key}.title`)}
                  </Title>
                  <Text className={classes.prose}>
                    {t(`${key}.description`)}
                  </Text>
                  <Box component="dl" className={classes.guideDefinitions}>
                    {entries.map((entry) => (
                      <Box key={entry}>
                        <Text
                          component="dt"
                          className={classes.definitionTitle}
                        >
                          {t(`${key}.${entry}.title`)}
                        </Text>
                        <Text component="dd" className={classes.prose} m={0}>
                          {t(`${key}.${entry}.text`)}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
              <Box
                component="section"
                id="alliances"
                className={classes.guideSection}
              >
                <Title order={2} className={classes.sectionTitle}>
                  {t('alliances.title')}
                </Title>
                <Text className={classes.prose}>
                  {t('alliances.description')}
                </Text>
                <Group className={classes.actions}>
                  <Button component={Link} href="/account/register" size="md">
                    {t('cta.createCommander')}
                  </Button>
                  <Button
                    component={Link}
                    href="/account/login"
                    variant="outline"
                    size="md"
                  >
                    {t('cta.returnToBattle')}
                  </Button>
                </Group>
              </Box>
            </Box>
          </Box>
        </Box>
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
