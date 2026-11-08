import { Box, Button, Table, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import frameClasses from '@/components/game/FantasyFrame.module.css';
import PublicHero from '@/components/public/PublicHero';
import classes from '@/components/public/PublicPages.module.css';

export interface GuideSectionContent {
  id: string;
  title: string;
  paragraphs?: ReactNode[];
  /** Bulleted (or numbered) points after the paragraphs. */
  items?: ReactNode[];
  ordered?: boolean;
  /** Tables, race crests and other extras, after the text. */
  children?: ReactNode;
}

interface GuideArticleProps {
  title: string;
  description: string;
  /** Accessible name of the section index. */
  tocLabel: string;
  sections: GuideSectionContent[];
  imageSrc?: string;
  /** Buttons or links under the hero copy. */
  heroActions?: ReactNode;
  /** Closing block after the last section (calls to action, related reading). */
  footer?: ReactNode;
}

/**
 * Long-form public article: PublicHero, a section index and titled sections.
 * Used by the strategy guides and the Chronicles lore page.
 */
export default function GuideArticle({
  title,
  description,
  tocLabel,
  sections,
  imageSrc,
  heroActions,
  footer,
}: GuideArticleProps) {
  return (
    <Box className={classes.page}>
      <PublicHero title={title} description={description} imageSrc={imageSrc}>
        {heroActions}
      </PublicHero>
      <Box className={classes.guideLayout}>
        <Box
          component="nav"
          aria-label={tocLabel}
          className={`${classes.guideNav} ${frameClasses.surface} ${frameClasses.ornate}`}
        >
          {sections.map((section) => (
            <Button
              key={section.id}
              component="a"
              href={`#${section.id}`}
              variant="subtle"
              justify="flex-start"
              fullWidth
            >
              {section.title}
            </Button>
          ))}
        </Box>
        <Box className={classes.guideContent}>
          {sections.map((section) => (
            <Box
              component="section"
              id={section.id}
              key={section.id}
              className={classes.guideSection}
            >
              <Title order={2} className={classes.sectionTitle}>
                {section.title}
              </Title>
              {section.paragraphs?.map((paragraph, index) => (
                <Text key={index} className={classes.prose}>
                  {paragraph}
                </Text>
              ))}
              {section.items && section.items.length > 0 && (
                <Box
                  component={section.ordered ? 'ol' : 'ul'}
                  className={classes.guideList}
                >
                  {section.items.map((item, index) => (
                    <li key={index}>
                      <Text className={classes.prose}>{item}</Text>
                    </li>
                  ))}
                </Box>
              )}
              {section.children}
            </Box>
          ))}
          {footer}
        </Box>
      </Box>
    </Box>
  );
}

interface GuideTableProps {
  caption: string;
  columns: string[];
  rows: ReactNode[][];
}

/**
 * Compact reference table. On narrow screens every row becomes a stacked card
 * (the column name is printed beside each value), so no column hides off-screen.
 */
export function GuideTable({ caption, columns, rows }: GuideTableProps) {
  return (
    <Box className={classes.guideTableWrap}>
      <Table className={classes.guideTable} verticalSpacing="xs" role="table">
        <Table.Caption>{caption}</Table.Caption>
        <Table.Thead role="rowgroup">
          <Table.Tr role="row">
            {columns.map((column) => (
              <Table.Th key={column} scope="col" role="columnheader">
                {column}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody role="rowgroup">
          {rows.map((row, rowIndex) => (
            <Table.Tr key={rowIndex} role="row">
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <Table.Th key={cellIndex} scope="row" role="rowheader">
                    {cell}
                  </Table.Th>
                ) : (
                  <Table.Td key={cellIndex} role="cell">
                    {/* Visual label for the stacked mobile layout; the real
                        column header already names the cell for screen readers. */}
                    <span className={classes.guideCellLabel} aria-hidden="true">
                      {columns[cellIndex]}
                    </span>
                    <span>{cell}</span>
                  </Table.Td>
                ),
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}
