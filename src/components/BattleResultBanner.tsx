import { Box, Text } from '@mantine/core';
import Image from 'next/image';
import type { ReactNode } from 'react';

type BattleBannerTone = 'blue' | 'green' | 'red' | 'gray';

type BattleResultBannerProps = {
  tone: BattleBannerTone;
  title: string;
  subtitle?: string;
  children?: ReactNode;
};

const bannerByTone: Record<BattleBannerTone, string> = {
  blue: '/assets/images/ui/battle-report/banners/banner-human-blue.webp',
  green: '/assets/images/ui/battle-report/banners/banner-elf-green.webp',
  red: '/assets/images/ui/battle-report/banners/banner-goblin-red.webp',
  gray: '/assets/images/ui/battle-report/banners/banner-undead-gray.webp',
};

/** Battle result banner. */
export function BattleResultBanner({
  tone,
  title,
  subtitle,
  children,
}: BattleResultBannerProps) {
  return (
    <Box
      style={{
        position: 'relative',
        minHeight: 260,
        display: 'grid',
        placeItems: 'center',
        isolation: 'isolate',
        overflow: 'visible',
        marginTop: -18,
        marginBottom: -38,
      }}
    >
      <Image
        src={bannerByTone[tone]}
        alt=""
        fill
        priority
        sizes="100vw"
        style={{
          objectFit: 'contain',
          zIndex: 0,
          pointerEvents: 'none',
          filter: 'drop-shadow(0 18px 28px rgba(0,0,0,0.7))',
        }}
      />

      <Box
        style={{
          position: 'relative',
          zIndex: 1,
          textAlign: 'center',
          paddingTop: 12,
          maxWidth: 760,
        }}
      >
        <Text
          component="h1"
          style={{
            margin: 0,
            fontFamily: 'Cinzel, MedievalSharp, serif',
            fontSize: 'clamp(2.4rem, 6vw, 3.5rem)',
            lineHeight: 0.95,
            letterSpacing: '0.08em',
            color: '#f7df9e',
            textShadow:
              '0 2px 0 rgba(0,0,0,0.9), 0 0 22px rgba(236,196,95,0.45)',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Text>

        {subtitle && (
          <Text
            mt={6}
            style={{
              fontFamily: 'MedievalSharp, serif',
              fontSize: 'clamp(0.55rem, 1.6vw, 1.0rem)',
              color: 'rgba(236, 229, 211, 0.86)',
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            }}
          >
            {subtitle}
          </Text>
        )}

        {children}
      </Box>
    </Box>
  );
}
