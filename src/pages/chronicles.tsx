import { Box, Button, Group, SimpleGrid, Text, Title } from '@mantine/core';
import type { GetStaticProps } from 'next';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import Image from '@/components/ArtworkImage';
import MainArea from '@/components/MainArea';
import { getRaceTextColor } from '@/components/player/PlayerIdentityLine';
import GuideArticle, {
  type GuideSectionContent,
} from '@/components/public/GuideArticle';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { serverSideTranslations } from '@/utils/serverTranslations';

const SECTIONS = [
  'oldWorld',
  'sundering',
  'realms',
  'peoples',
  'greatTurning',
] as const;
const RACES = ['ELF', 'HUMAN', 'GOBLIN', 'UNDEAD'] as const;

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : [];

export default function Chronicles() {
  const { t } = useTranslation('chronicles');

  const sections: GuideSectionContent[] = SECTIONS.map((id) => {
    const base = `sections.${id}`;
    const paragraphs = asList(t(`${base}.paragraphs`, { returnObjects: true }));
    const section: GuideSectionContent = {
      id,
      title: t(`${base}.title`),
      paragraphs,
    };
    if (id === 'peoples') {
      section.children = (
        <>
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl" mt="xl">
            {RACES.map((race) => (
              <Box
                key={race}
                className={classes.raceEntry}
                style={{
                  borderTop: `2px solid ${getRaceTextColor(race) ?? 'var(--ot-border)'}`,
                  paddingTop: 20,
                }}
              >
                <Image
                  src={`/assets/shields/${race}_150x150.webp`}
                  alt=""
                  width={72}
                  height={80}
                />
                <Box>
                  <Title order={3} className={classes.highlightTitle}>
                    {t(`${base}.races.${race}.name`)}
                  </Title>
                  <Text className={classes.prose}>
                    {t(`${base}.races.${race}.text`)}
                  </Text>
                </Box>
              </Box>
            ))}
          </SimpleGrid>
          <Text className={classes.prose} mt="xl">
            {t(`${base}.closing`)}
          </Text>
        </>
      );
    }
    if (id === 'greatTurning') {
      section.children = (
        <Group className={classes.actions}>
          <Button component={Link} href="/community/stats" variant="outline">
            {t(`${base}.statsLink`)}
          </Button>
        </Group>
      );
    }
    return section;
  });

  return (
    <>
      <SeoHead title={t('metaTitle')} description={t('metaDescription')} />
      <MainArea title={t('title')}>
        <GuideArticle
          title={t('title')}
          description={t('intro')}
          tocLabel={t('tocLabel')}
          sections={sections}
          imageSrc="/assets/images/ui/public/throne-room.webp"
          footer={
            <Group className={classes.actions}>
              <Button component={Link} href="/account/register" size="md">
                {t('cta.createCommander')}
              </Button>
              <Button
                component={Link}
                href="/how-to-play"
                variant="outline"
                size="md"
              >
                {t('cta.howToPlay')}
              </Button>
              <Button
                component={Link}
                href="/guides"
                variant="outline"
                size="md"
              >
                {t('cta.guides')}
              </Button>
            </Group>
          }
        />
      </MainArea>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', [
      'common',
      'navigation',
      'chronicles',
    ])),
  },
});
