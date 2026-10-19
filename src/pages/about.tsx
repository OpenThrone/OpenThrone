import { Accordion, Box, Button, Group, Text, Title } from '@mantine/core';
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

const About = () => {
  const { t } = useTranslation('common');
  return (
    <>
      <SeoHead
        title={t('about.aboutOpenThrone')}
        description={t('about.description')}
      />
      <MainArea title={t('about.title')}>
        <Box className={classes.page}>
          <PublicHero
            title={t('about.aboutOpenThrone')}
            description={t('about.originStory')}
          >
            <Group className={classes.actions}>
              <Button component={Link} href="/account/register" size="md">
                {t('about.beginYourReign')}
              </Button>
              <Button
                component={Link}
                href="/how-to-play"
                variant="outline"
                size="md"
              >
                {t('about.learnToPlay')}
              </Button>
            </Group>
          </PublicHero>

          <Box className={classes.chronicle}>
            <Box component="section">
              <Title order={2} className={classes.sectionTitle}>
                {t('about.originStoryTitle')}
              </Title>
              <Text className={classes.prose}>{t('about.modernStack')}</Text>
              <Text className={classes.prose}>{t('about.notAffiliated')}</Text>
              <Box className={classes.shields} aria-hidden="true">
                {['ELF', 'HUMAN', 'GOBLIN', 'UNDEAD'].map((race) => (
                  <Image
                    key={race}
                    src={`/assets/shields/${race}_150x150.webp`}
                    alt=""
                    width={64}
                    height={72}
                    className={classes.shield}
                  />
                ))}
              </Box>
            </Box>
            <Box
              component="aside"
              className={`${classes.status} ${frameClasses.surface} ${frameClasses.ornate}`}
            >
              <Title order={2} className={classes.sectionTitle}>
                {t('about.projectStatus')}
              </Title>
              <Text className={classes.statusLabel}>
                {t('about.preAlpha')} · {t('about.liveDevelopment')}
              </Text>
              <Text className={classes.prose}>{t('about.serverStatus')}</Text>
              <ul className={classes.statusList}>
                <li>{t('about.mayReset')}</li>
                <li>{t('about.featuresAdded')}</li>
                <li>{t('about.basicMechanics')}</li>
              </ul>
            </Box>
          </Box>

          <Box component="section" className={classes.development}>
            <Box>
              <Title order={2} className={classes.sectionTitle}>
                {t('about.development')}
              </Title>
              <Text className={classes.prose}>
                {t('about.developmentInfo')}
              </Text>
              <Group className={classes.actions}>
                <Button
                  component="a"
                  href="https://discord.com/invite/j9NYxmBCjA"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outline"
                >
                  {t('about.joinDiscord')}
                </Button>
                <Button
                  component="a"
                  href="https://github.com/OpenThrone/OpenThrone"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outline"
                >
                  {t('about.viewGitHub')}
                </Button>
              </Group>
            </Box>
            <Box className={classes.faq}>
              <Title order={2} className={classes.sectionTitle}>
                {t('about.faq')}
              </Title>
              <Accordion
                variant="default"
                classNames={{
                  item: classes.faqItem,
                  control: classes.faqControl,
                  panel: classes.faqPanel,
                }}
              >
                {[
                  {
                    key: 'active',
                    question: 'faqIsGameStillBeingDeveloped',
                    answer: 'faqActive',
                  },
                  { key: 'help', question: 'howCanIHelp', answer: 'faqHelp' },
                  {
                    key: 'ideas',
                    question: 'canSuggestIdeas',
                    answer: 'faqIdeas',
                  },
                ].map(({ key, question, answer }) => (
                  <Accordion.Item key={key} value={key}>
                    <Accordion.Control>
                      {t(`about.${question}`)}
                    </Accordion.Control>
                    <Accordion.Panel>{t(`about.${answer}`)}</Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            </Box>
          </Box>
          <Text className={classes.footerNote}>{t('about.licensed')}</Text>
        </Box>
      </MainArea>
    </>
  );
};

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', ['common', 'navigation'])),
  },
});

export default About;
