import { Box, Button, Group, SimpleGrid, Text, Title } from '@mantine/core';
import type { GetStaticProps, InferGetStaticPropsType } from 'next';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useEffect } from 'react';

import Image from '@/components/ArtworkImage';
import frameClasses from '@/components/game/FantasyFrame.module.css';
import MainArea from '@/components/MainArea';
import PublicHero from '@/components/public/PublicHero';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import {
  FEATURE_REQUIREMENTS,
  getFeaturePlayerLevel,
} from '@/constants/FeatureUnlocks';
import { useFriendTransferGuide } from '@/hooks/useFriendTransferGuide';
import { useStaminaGuide } from '@/hooks/useStaminaGuide';
import { CURRENT_COMBAT_RULESET } from '@/utils/balance/combatRulesets';
import { getProtectionShieldFacts } from '@/utils/battleProtection';
import { getClassBonusPercent, PLAYER_CLASSES } from '@/utils/classBonuses';
import { HOW_TO_PLAY_ECONOMY_ENTRIES } from '@/utils/howToPlayGuide';
import { serverSideTranslations } from '@/utils/serverTranslations';
import { fortificationName } from '@/utils/structureNames';
import { getTurnIntervalMinutes } from '@/utils/timefunctions';

const sections = [
  'coreLoop',
  'races',
  'army',
  'economy',
  'combat',
  'alliances',
] as const;
const races = ['elf', 'human', 'goblin', 'undead'] as const;

/** Live combat-v11 XP rule numbers for the Experience entry (#298, #334). */
const battleXpGuideParams = () => {
  const rules = CURRENT_COMBAT_RULESET.battleXp;
  return {
    effortFloor: Math.round((rules?.effortFloorRatio ?? 0) * 100),
    effortFull: Math.round((rules?.effortFullRatio ?? 0) * 100),
    threatFloor: Math.round((rules?.defenderThreatFloor ?? 1) * 100),
    graceDays: rules?.stallGraceDays ?? 0,
    stallStep: Math.round((rules?.stallPerDay ?? 0) * 100),
    stallMax: rules?.stallMaxMultiplier ?? 1,
  };
};

const HowToPlay = ({
  turnMinutes,
}: InferGetStaticPropsType<typeof getStaticProps>) => {
  const { t, i18n } = useTranslation('how-to-play');
  const { t: tStructures } = useTranslation('structures');
  const { t: tCommon } = useTranslation('common');
  const turnParams = { minutes: turnMinutes };
  const { allowance, ...shieldFacts } = getProtectionShieldFacts();
  const entryParams = {
    allowance: allowance.toLocaleString(i18n.language),
    share: shieldFacts.share,
    taperLevel: shieldFacts.taperLevel,
    mercenaryFort:
      fortificationName(
        tStructures,
        FEATURE_REQUIREMENTS.MERCENARY_HALL.fortLevel,
      ) ?? '',
    mercenaryLevel: getFeaturePlayerLevel('MERCENARY_HALL') ?? '',
    ...battleXpGuideParams(),
  };
  const staminaGuide = useStaminaGuide();
  const transferGuide = useFriendTransferGuide();
  // The browser's own jump to a shared #anchor happens before the layout
  // settles and lands at the top; scroll again once the page is mounted.
  useEffect(() => {
    let id = '';
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'auto' });
  }, []);
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
                  {t('coreLoop.description', turnParams)}
                </Text>
                <ol className={classes.guideSteps}>
                  {['earn', 'attack', 'build', 'dominate'].map((step) => (
                    <li key={step}>
                      <Title order={3} className={classes.highlightTitle}>
                        {t(`coreLoop.steps.${step}.title`)}
                      </Title>
                      <Text className={classes.prose}>
                        {t(`coreLoop.steps.${step}.text`, turnParams)}
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
                <Title
                  order={3}
                  id="classes"
                  className={classes.highlightTitle}
                  mt="xl"
                >
                  {t('races.classesTitle')}
                </Title>
                <Text className={classes.prose}>
                  {t('races.classesDescription')}
                </Text>
                <Box component="dl" className={classes.guideDefinitions}>
                  {PLAYER_CLASSES.map((playerClass) => (
                    <div key={playerClass}>
                      <Text component="dt" className={classes.definitionTitle}>
                        {tCommon(`classes.${playerClass}`)}
                      </Text>
                      <Text component="dd" className={classes.prose} m={0}>
                        {tCommon(`classDescriptions.${playerClass}`, {
                          amount: getClassBonusPercent(playerClass),
                        })}
                      </Text>
                    </div>
                  ))}
                </Box>
              </Box>
              {[
                {
                  key: 'army',
                  entries: ['workers', 'attack', 'defense', 'spies'],
                },
                {
                  key: 'economy',
                  entries: HOW_TO_PLAY_ECONOMY_ENTRIES,
                },
                {
                  key: 'combat',
                  entries: [
                    'attack',
                    'defense',
                    'spy',
                    'losses',
                    'protection',
                    'stamina',
                    'experience',
                  ],
                },
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
                      // Anchors such as #combat-stamina for in-game links.
                      <Box
                        key={entry}
                        id={`${key}-${entry}`}
                        className={
                          entry === 'stamina' || entry === 'transfers'
                            ? classes.definitionWide
                            : undefined
                        }
                      >
                        <Text
                          component="dt"
                          className={classes.definitionTitle}
                        >
                          {t(`${key}.${entry}.title`)}
                        </Text>
                        <Text component="dd" className={classes.prose} m={0}>
                          {entry === 'stamina'
                            ? staminaGuide
                            : entry === 'transfers'
                              ? transferGuide
                              : t(`${key}.${entry}.text`, entryParams)}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
              <Box
                component="section"
                id="your-data"
                className={classes.guideSection}
              >
                <Title order={2} className={classes.sectionTitle}>
                  {t('yourData.title')}
                </Title>
                <Text className={classes.prose}>
                  {t('yourData.description')}
                </Text>
                <Group className={classes.actions}>
                  <Button
                    component={Link}
                    href="/home/settings#privacy"
                    variant="outline"
                    size="md"
                  >
                    {t('yourData.link')}
                  </Button>
                </Group>
              </Box>
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
                <Text className={classes.prose}>{t('alliances.hall')}</Text>
                <Text className={classes.prose}>{t('alliances.dues')}</Text>
                <Text className={classes.prose}>
                  {t('alliances.eraReserve')}
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

export const getStaticProps = (async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'how-to-play',
      'structures',
    ])),
    // Copy follows the configured turn interval, not the 30-minute default (#278).
    turnMinutes: getTurnIntervalMinutes(),
  },
})) satisfies GetStaticProps;
export default HowToPlay;
