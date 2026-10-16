import { Accordion, Box, Button, Group, Text, Title } from '@mantine/core';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import MainArea from '@/components/MainArea';
import PublicHero from '@/components/public/PublicHero';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { serverSideTranslations } from '@/utils/serverTranslations';

const QUESTIONS = {
  starting: ['game', 'race', 'firstSteps'],
  strategy: ['training', 'bank', 'combat'],
  help: ['access', 'password', 'report'],
} as const;

export default function Faq() {
  const { t } = useTranslation('faq');

  return (
    <>
      <SeoHead title={t('metaTitle')} description={t('metaDescription')} />
      <MainArea title={t('title')}>
        <Box className={classes.page}>
          <PublicHero title={t('title')} description={t('intro')}>
            <Group className={classes.actions}>
              <Button component={Link} href="/how-to-play">
                {t('links.guide')}
              </Button>
              <Button component={Link} href="/community/news" variant="outline">
                {t('links.news')}
              </Button>
            </Group>
          </PublicHero>
          <Box className={classes.guideContent} mt="xl">
            {Object.entries(QUESTIONS).map(([section, questions]) => (
              <Box
                component="section"
                key={section}
                className={classes.guideSection}
              >
                <Title order={2} className={classes.sectionTitle}>
                  {t(`sections.${section}`)}
                </Title>
                <Accordion
                  multiple
                  defaultValue={[...questions]}
                  transitionDuration={0}
                  classNames={{
                    item: classes.faqItem,
                    control: classes.faqControl,
                    panel: classes.faqPanel,
                  }}
                >
                  {questions.map((question) => (
                    <Accordion.Item key={question} value={question}>
                      <Accordion.Control>
                        {t(`questions.${question}.title`)}
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Text className={classes.prose}>
                          {t(`questions.${question}.answer`)}
                        </Text>
                        {question === 'password' && (
                          <Group className={classes.actions}>
                            <Button
                              component={Link}
                              href="/account/password-reset"
                              variant="outline"
                            >
                              {t('links.password')}
                            </Button>
                          </Group>
                        )}
                        {question === 'report' && (
                          <Group className={classes.actions}>
                            <Button
                              component="a"
                              href="https://discord.gg/j9NYxmBCjA"
                              variant="outline"
                            >
                              {t('links.discord')}
                            </Button>
                          </Group>
                        )}
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              </Box>
            ))}
            <Group className={classes.actions}>
              <Button component={Link} href="/about" variant="outline">
                {t('links.about')}
              </Button>
            </Group>
          </Box>
        </Box>
      </MainArea>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'faq',
    ])),
  },
});
