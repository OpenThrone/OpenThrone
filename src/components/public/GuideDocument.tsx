import { Box, Button, Group, Text } from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';

import type { GuideSectionContent } from '@/components/public/GuideArticle';
import GuideArticle, { GuideTable } from '@/components/public/GuideArticle';
import classes from '@/components/public/PublicPages.module.css';
import SeoHead from '@/components/SeoHead';
import { useGuideFacts } from '@/hooks/useGuideFacts';
import { useStaminaGuide } from '@/hooks/useStaminaGuide';
import type { GuideFacts } from '@/utils/guideFacts';
import { structureName } from '@/utils/structureNames';

export const GUIDE_SLUGS = [
  'first-kingdom',
  'economy-and-growth',
  'combat-spying-stamina',
] as const;
export type GuideSlug = (typeof GUIDE_SLUGS)[number];

export const isGuideSlug = (value: unknown): value is GuideSlug =>
  GUIDE_SLUGS.includes(value as GuideSlug);

const GUIDE_SECTIONS: Record<GuideSlug, string[]> = {
  'first-kingdom': [
    'start',
    'spend',
    'protection',
    'growth',
    'bank',
    'checklist',
  ],
  'economy-and-growth': [
    'income',
    'economy',
    'housing',
    'fortifications',
    'bank',
    'order',
  ],
  'combat-spying-stamina': [
    'targets',
    'loot',
    'losses',
    'spying',
    'stamina',
    'habits',
  ],
};

/** Sections whose points are steps in a sequence. */
const ORDERED_SECTIONS = new Set([
  'first-kingdom:checklist',
  'economy-and-growth:order',
]);

type FormattedValues = { [key: string]: string | FormattedValues };

/** Every number as locale text ("25,000", "1,5"); the reference tables stay raw. */
function formatFacts(
  value: unknown,
  format: (n: number) => string,
): string | FormattedValues {
  if (typeof value === 'number') return format(value);
  if (typeof value === 'boolean' || value === null || value === undefined)
    return String(value);
  if (typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'tables')
        .map(([key, entry]) => [key, formatFacts(entry, format)]),
    );
  return String(value);
}

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : [];

/** One strategy guide: article layout, live figures, reference tables and links. */
export default function GuideDocument({ slug }: { slug: GuideSlug }) {
  const { t, i18n } = useTranslation('guides');
  const { t: tStructures } = useTranslation('structures');
  const facts: GuideFacts = useGuideFacts();
  const staminaGuide = useStaminaGuide();
  const locale = i18n.language;

  const values = useMemo(() => {
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const economyName = (index: number) =>
      structureName(
        tStructures,
        'economy',
        index,
        facts.tables.economy[index]?.name,
      ) ?? '';
    return {
      ...(formatFacts(facts, (n) => number.format(n)) as FormattedValues),
      unlockNames: {
        goldTransfer: economyName(facts.unlocks.goldTransferEconomy),
        mercenaryHall: economyName(facts.unlocks.mercenaryHallEconomy),
      },
    };
  }, [facts, locale, tStructures]);

  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const text = (key: string) => t(`${slug}.${key}`, values);
  const list = (key: string) =>
    asList(t(`${slug}.${key}`, { ...values, returnObjects: true }));
  const column = (key: string) => t(`common.columns.${key}`);

  const tables: Record<string, GuideSectionContent['children']> = {
    'economy-and-growth:economy': (
      <GuideTable
        caption={text('sections.economy.tableCaption')}
        columns={[
          column('upgrade'),
          column('cost'),
          column('fortLevel'),
          column('goldPerWorker'),
          column('deposits'),
        ]}
        rows={facts.tables.economy.map((row) => [
          structureName(tStructures, 'economy', row.index, row.name),
          row.cost ? number.format(row.cost) : t('common.free'),
          row.fortLevel ? number.format(row.fortLevel) : '–',
          number.format(row.goldPerWorker),
          number.format(row.depositsPerDay),
        ])}
      />
    ),
    'economy-and-growth:housing': (
      <GuideTable
        caption={text('sections.housing.tableCaption')}
        columns={[
          column('upgrade'),
          column('cost'),
          column('fortLevel'),
          column('citizens'),
        ]}
        rows={facts.tables.housing.map((row) => [
          structureName(tStructures, 'housing', row.index, row.name),
          row.cost ? number.format(row.cost) : t('common.free'),
          row.fortLevel ? number.format(row.fortLevel) : '–',
          number.format(row.citizensDaily),
        ])}
      />
    ),
    'economy-and-growth:fortifications': (
      <GuideTable
        caption={text('sections.fortifications.tableCaption')}
        columns={[
          column('fortification'),
          column('cost'),
          column('goldPerTurn'),
          column('hitpoints'),
        ]}
        rows={facts.tables.fortifications.map((row) => [
          structureName(tStructures, 'fortifications', row.level, row.name),
          row.cost ? number.format(row.cost) : t('common.free'),
          number.format(row.goldPerTurn),
          number.format(row.hitpoints),
        ])}
      />
    ),
  };

  const sections: GuideSectionContent[] = GUIDE_SECTIONS[slug].map((id) => {
    const base = `sections.${id}`;
    let paragraphs: string[] = list(`${base}.paragraphs`);
    if (slug === 'combat-spying-stamina' && id === 'stamina') {
      // The live stamina rules come from the shared guide text; the extra
      // sentences only apply while stamina is switched on.
      paragraphs = facts.stamina.enabled
        ? [staminaGuide, ...paragraphs, text(`${base}.pacing`)]
        : [staminaGuide];
    }
    return {
      id,
      title: text(`${base}.title`),
      paragraphs,
      items: list(`${base}.items`),
      ordered: ORDERED_SECTIONS.has(`${slug}:${id}`),
      children: tables[`${slug}:${id}`],
    };
  });

  const relatedSlugs = asList(
    t(`${slug}.related`, { returnObjects: true }),
  ).filter(isGuideSlug);

  return (
    <>
      <SeoHead
        title={text('metaTitle')}
        description={text('metaDescription')}
      />
      <GuideArticle
        title={text('title')}
        description={text('intro')}
        tocLabel={t('common.tocLabel')}
        sections={sections}
        imageSrc="/assets/images/ui/public/war-table.webp"
        footer={
          <Box className={classes.guideFooter}>
            <Text className={classes.footerNote}>
              {t('common.numbersNote')}
            </Text>
            <Text className={classes.highlightTitle} component="p">
              {t('common.relatedTitle')}
            </Text>
            <Box className={classes.relatedLinks}>
              {relatedSlugs.map((related) => (
                <Button
                  key={related}
                  component={Link}
                  href={`/guides/${related}`}
                  variant="outline"
                >
                  {t(`index.cards.${related}.title`)}
                </Button>
              ))}
              <Button component={Link} href="/guides" variant="outline">
                {t('common.allGuides')}
              </Button>
              <Button component={Link} href="/how-to-play" variant="outline">
                {t('common.howToPlay')}
              </Button>
            </Box>
            <Group className={classes.actions}>
              <Button component={Link} href="/account/register" size="md">
                {t('common.createCommander')}
              </Button>
              <Button
                component={Link}
                href="/account/login"
                variant="outline"
                size="md"
              >
                {t('common.returnToBattle')}
              </Button>
            </Group>
          </Box>
        }
      />
    </>
  );
}
