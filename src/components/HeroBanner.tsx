import { Box, Text, useMantineTheme } from '@mantine/core';
import React from 'react';

type HeroBannerProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  height?: number;
  maxWidth?: number | string;
  leftPadding?: number;

  /**
   * Optional: override theme-derived colors
   */
  clothTop?: string;
  clothBottom?: string;
  trimA?: string;
  trimB?: string;
  trimC?: string;
  iconFill?: string;
};

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
  iconFill,
}: HeroBannerProps) {
  const theme = useMantineTheme();
  /**
   * You can tune these indices to taste.
   * brand is your primaryColor for each race theme.
   */
  const brand = theme.colors[theme.primaryColor] ?? theme.colors.brand;
  const secondary = theme.colors.secondary ?? brand;

  // Cloth: darker + saturated
  const computedClothTop = clothTop ?? brand?.[7] ?? '#7b0f14';
  const computedClothBottom = clothBottom ?? brand?.[9] ?? '#4b0a0d';

  // Trim: warm highlight (pull from secondary palette so it changes per race)
  const computedTrimA = trimA ?? secondary?.[2] ?? '#f8e08a';
  const computedTrimB = trimB ?? secondary?.[5] ?? '#d7b24a';
  const computedTrimC = trimC ?? secondary?.[2] ?? '#f8e08a';

  // Icon: match trim center
  const computedIconFill = iconFill ?? computedTrimB;

  return (
    <Box
      style={{
        position: 'relative',
        width: '100%',
        maxWidth,
        height,
        margin: '0 auto 18px',
      }}
    >
      <svg
        viewBox="0 0 1200 190"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-testid="decorative-element"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      >
        <defs>
          <filter id="ot_ds" x="-20%" y="-50%" width="140%" height="200%">
            <feDropShadow
              dx="0"
              dy="6"
              stdDeviation="6"
              floodColor="#000"
              floodOpacity="0.45"
            />
          </filter>

          <linearGradient id="ot_cloth" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={computedClothTop} />
            <stop offset="1" stopColor={computedClothBottom} />
          </linearGradient>

          <linearGradient id="ot_gold" x1="0" x2="1">
            <stop offset="0" stopColor={computedTrimA} />
            <stop offset="0.5" stopColor={computedTrimB} />
            <stop offset="1" stopColor={computedTrimC} />
          </linearGradient>
        </defs>

        {/* main banner plate */}
        <rect
          x="120"
          y="22"
          width="1060"
          height="146"
          rx="10"
          fill="url(#ot_cloth)"
          filter="url(#ot_ds)"
        />
        {/* trim */}
        <rect
          x="132"
          y="34"
          width="1036"
          height="122"
          rx="8"
          fill="none"
          stroke="url(#ot_gold)"
          strokeWidth="6"
        />

        {/* left hanging strap + pennant */}
        <g filter="url(#ot_ds)">
          {/* pennant (dropped down a bit so it doesn't feel glued to the strap) */}
          <path d="M55 34 H155 V150 L105 176 L55 150 Z" fill="url(#ot_cloth)" />
          <path
            d="M63 44 H147 V145 L105 166 L63 145 Z"
            fill="none"
            stroke="url(#ot_gold)"
            strokeWidth="5"
          />

          {/* person icon */}
          <g transform="translate(105,102)" fill={computedIconFill}>
            <circle cx="0" cy="-18" r="12" />
            <path d="M-26 10 C-26 -2, -8 -6, 0 -6 C 8 -6, 26 -2, 26 10 L26 20 C26 24, -26 24, -26 20 Z" />
          </g>
        </g>
      </svg>

      {/* HTML text layer */}
      <Box
        style={{
          position: 'absolute',
          inset: 0,
          padding: `28px 36px 22px ${leftPadding}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 10,
          textShadow: '0 2px 12px rgba(0,0,0,0.55)',
        }}
      >
        <Text
          data-testid="large-heading"
          style={{
            fontFamily: 'Cinzel, serif',
            fontWeight: 700,
            letterSpacing: '0.5px',
            color: 'rgba(243,230,191,0.95)',
            fontSize: 'clamp(18px, 2.2vw, 34px)',
          }}
        >
          {title}
        </Text>

        {subtitle ? (
          <Text
            style={{
              fontFamily: 'Inter, sans-serif',
              color: 'rgba(243,230,191,0.85)',
              fontSize: 'clamp(12px, 1.1vw, 15px)',
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}
