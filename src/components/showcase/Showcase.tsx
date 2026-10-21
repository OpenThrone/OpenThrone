import { Badge, Box, Group, Stack, Text, Title } from '@mantine/core';
import type { MouseEvent, ReactNode } from 'react';

import { GameCard } from '@/components/game/GameCard';
import { SectionHeading } from '@/components/game/SectionHeading';
import { alertService } from '@/services/Alert.service';

import classes from './Showcase.module.css';

/** Mock actions report what would have happened instead of calling the API. */
export function mockAction(label: string) {
  return () => alertService.info(`Mock action: ${label}`);
}

/**
 * Turns clicks on the named buttons (by accessible name or text) into mock
 * actions, for real components whose buttons open live dialogs or navigate.
 */
export function MockClicks({
  labels,
  children,
}: {
  labels: string[];
  children: ReactNode;
}) {
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest('button, a');
    const name =
      button?.getAttribute('aria-label') ?? button?.textContent?.trim() ?? '';
    if (!button || !labels.includes(name)) return;
    event.preventDefault();
    event.stopPropagation();
    mockAction(name)();
  };
  return <div onClickCapture={onClickCapture}>{children}</div>;
}

interface ShowcaseSectionProps {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}

/** A chapter of the showcase, reachable from the contents bar. */
export function ShowcaseSection({
  id,
  title,
  description,
  children,
}: ShowcaseSectionProps) {
  return (
    <Box
      component="section"
      id={id}
      aria-labelledby={`${id}-title`}
      className={classes.section}
    >
      <Stack gap={4} mb="lg">
        <Title order={2} id={`${id}-title`} className={classes.sectionTitle}>
          {title}
        </Title>
        <Text size="sm" c="var(--ot-muted)" maw={760}>
          {description}
        </Text>
      </Stack>
      <div className={classes.grid}>{children}</div>
    </Box>
  );
}

interface SpecimenProps {
  name: string;
  /** Where the component appears in the game, e.g. "/battle/users". */
  usedOn?: string[];
  note?: string;
  /** Span the full grid width for wide components. */
  wide?: boolean;
  /**
   * Seat the component in the in-game card frame (default). Pass false for
   * components that bring their own frame (cards, reports, banners, heroes),
   * so they sit on the backdrop exactly as they do on a page.
   */
  framed?: boolean;
  children: ReactNode;
}

function UsedOn({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null;
  return (
    <Group gap={6}>
      {paths.map((path) => (
        <Badge
          key={path}
          size="xs"
          variant="outline"
          color="gray"
          className={classes.path}
        >
          {path}
        </Badge>
      ))}
    </Group>
  );
}

/** One component as players see it, labelled with where it lives. */
export function Specimen({
  name,
  usedOn = [],
  note,
  wide = false,
  framed = true,
  children,
}: SpecimenProps) {
  const noteText = note && (
    <Text size="xs" c="var(--ot-muted)" mb="sm">
      {note}
    </Text>
  );

  if (framed) {
    return (
      <div className={`${classes.specimen} ${wide ? classes.wide : ''}`}>
        <GameCard title={name} titleOrder={3}>
          {usedOn.length > 0 && (
            <Box mb="sm">
              <UsedOn paths={usedOn} />
            </Box>
          )}
          {noteText}
          <div className={classes.stage}>{children}</div>
        </GameCard>
      </div>
    );
  }

  return (
    <div className={`${classes.specimen} ${wide ? classes.wide : ''}`}>
      <Group
        justify="space-between"
        align="center"
        gap="xs"
        className={classes.specimenHeader}
      >
        <SectionHeading order={3} mb={0}>
          {name}
        </SectionHeading>
        <UsedOn paths={usedOn} />
      </Group>
      {noteText}
      <div className={classes.stage}>{children}</div>
    </div>
  );
}
