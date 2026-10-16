import { Box, Text, useMantineTheme } from '@mantine/core';
import React from 'react';

import Image from '@/components/ArtworkImage';
import classes from '@/components/HeroBanner.module.css';
import type { PlayerRace } from '@/types/typings';

type HeroBannerProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  height?: number;
  maxWidth?: number | string;
  leftPadding?: number;
  clothTop?: string;
  clothBottom?: string;
  trimA?: string;
  trimB?: string;
  trimC?: string;
  race?: PlayerRace;
};

/** A mounted race crest and its inset kingdom ribbon. */
export default function HeroBanner({
  title,
  subtitle,
  height = 140,
  maxWidth = 1040,
  leftPadding = 170,
  clothTop,
  clothBottom,
  trimA,
  trimB,
  trimC,
  race = 'ELF',
}: HeroBannerProps) {
  const theme = useMantineTheme();
  const brand = theme.colors[theme.primaryColor] ?? theme.colors.brand;
  const secondary = theme.colors.secondary ?? brand;

  return (
    <Box
      className={classes.banner}
      style={
        {
          maxWidth,
          minHeight: height,
          '--banner-cloth-top': clothTop ?? brand?.[7] ?? 'var(--ot-brand)',
          '--banner-cloth-bottom':
            clothBottom ?? brand?.[9] ?? 'var(--ot-inset)',
          '--banner-trim-light': trimA ?? secondary?.[2] ?? 'var(--ot-heading)',
          '--banner-trim-mid': trimB ?? secondary?.[5] ?? 'var(--ot-accent)',
          '--banner-trim-end': trimC ?? secondary?.[2] ?? 'var(--ot-heading)',
          '--banner-text-inset': `${Math.max(leftPadding - 144, 20)}px`,
        } as React.CSSProperties
      }
    >
      <div
        className={classes.plate}
        aria-hidden="true"
        data-testid="decorative-element"
      />
      <div className={classes.figure} aria-hidden="true">
        <Image
          src={`/assets/shields/${race}.webp`}
          alt=""
          width={192}
          height={192}
          sizes="144px"
          className={classes.shield}
        />
      </div>
      <Box className={classes.textLayer}>
        <Text className={classes.title} data-testid="large-heading">
          {title}
        </Text>
        {subtitle ? <Text className={classes.subtitle}>{subtitle}</Text> : null}
      </Box>
    </Box>
  );
}
