import React from 'react';
import { Box, Stack, Text, Group, Divider, Button, TextInput, RingProgress, Center } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faCoins, faChessRook } from '@fortawesome/free-solid-svg-icons';
// import RpgAwesomeIcon from '../RpgAwesomeIcon'; // Uncomment if you have this

interface ScrollSidebarProps {
  children?: React.ReactNode;
  raceColor?: string; // e.g. '#f3e5ab'
  inkColor?: string;
  accentColor?: string;
  maxWidth?: string | number;
}

// 1. Helper Component for the Rollers (Cleans up the main code)
const ScrollRoller = () => {
  const rollerGradient = 'linear-gradient(to bottom, #3e2723 0%, #5d4037 50%, #271c19 100%)';
  const goldGradient = 'linear-gradient(135deg, #b8860b 0%, #ffd700 50%, #8b6914 100%)';

  const knobStyle = {
    width: '16px',
    height: '32px',
    background: goldGradient,
    borderRadius: '4px',
    border: '1px solid #3e2723',
    boxShadow: 'inset 0 0 2px rgba(255,255,255,0.4), 0 3px 5px rgba(0,0,0,0.6)',
    zIndex: 2
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 10, height: '32px' }}>
      <div style={knobStyle} />
      <div style={{
        height: '22px',
        width: '100%',
        background: rollerGradient,
        borderRadius: '2px',
        margin: '0 -2px', // Pull knobs in slightly
        boxShadow: '0 4px 6px rgba(0,0,0,0.5)',
      }} />
      <div style={knobStyle} />
    </div>
  );
};

export const ScrollSidebar: React.FC<ScrollSidebarProps> = ({
  children,
  raceColor = '#f3e5ab',
  inkColor = '#3e2723',
  accentColor = '#b8860b',
  maxWidth = '320px',
}) => {

  // 2. Texture & Theme
  const paperTexture = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.15'/%3E%3C/svg%3E")`;
  const scrollContent = children ?? (
    <>
      {/* HEADER */}
      <Group justify="center" mb="sm" gap="xs">
        <Text span c="dimmed" size="lg">❧</Text>
        <Text size="xl" fw={900} c={inkColor} style={{ letterSpacing: '1px', textTransform: 'uppercase' }}>
          Advisor
        </Text>
        <Text span c="dimmed" size="lg" style={{ transform: 'scaleX(-1)' }}>❧</Text>
      </Group>

      {/* MODERN FEATURE: The Ring Progress (Styled for Scroll) */}
      <Center mb="lg">
        <RingProgress
          size={120}
          thickness={8}
          roundCaps
          // The "track" is faint brown, the "progress" is Gold
          sections={[{ value: 65, color: accentColor }]}
          rootColor="rgba(62, 39, 35, 0.1)"
          label={
            <Center>
              <Stack gap={0} align="center">
                <Text size="xs" fw={700} c={inkColor} tt="uppercase" style={{ opacity: 0.7 }}>Turns</Text>
                <Text size="lg" fw={900} c={inkColor}>1250</Text>
              </Stack>
            </Center>
          }
        />
      </Center>

      <Text ta="center" size="sm" fs="italic" c={inkColor} mb="lg" style={{ lineHeight: 1.4, opacity: 0.85 }}>
        &ldquo;Construct a Bank to protect your gold from enemy raids.&rdquo;
      </Text>

      <Divider my="md" color={inkColor} style={{ opacity: 0.3 }} />

      {/* CONTENT (Stats using Modern Layout but Ink Colors) */}
      <Stack gap="sm">

        <Group justify="space-between">
          <Group gap="xs">
            <FontAwesomeIcon icon={faCoins} color={accentColor} />
            <Text size="sm" fw={700} c={inkColor}>Gold</Text>
          </Group>
          <Text size="sm" fw={900} c={inkColor} style={{ fontFamily: 'monospace' }}>
            876,543
          </Text>
        </Group>

        <Group justify="space-between">
          <Group gap="xs">
            <FontAwesomeIcon icon={faChessRook} color="#5d4037" />
            <Text size="sm" fw={700} c={inkColor}>Level</Text>
          </Group>
          <Text size="sm" fw={900} c={inkColor} style={{ fontFamily: 'monospace' }}>
            32
          </Text>
        </Group>

        {children}
      </Stack>

      <Divider my="md" color={inkColor} style={{ opacity: 0.3 }} />

      {/* SEARCH (Styled like an ink entry) */}
      <Box>
        <Text fw={700} size="sm" mb={2} c={inkColor} ta="center">Search Archives</Text>
        <Group gap={0} style={{ borderBottom: `2px solid ${inkColor}`, paddingBottom: '2px' }}>
          <TextInput
            variant="unstyled"
            placeholder="Query..."
            style={{ flex: 1 }}
            styles={{
              input: {
                color: inkColor,
                fontFamily: 'MedievalSharp, serif',
                fontSize: '16px',
                '::placeholder': { color: 'rgba(62, 39, 35, 0.4)' }
              }
            }}
          />
          <Button size="xs" variant="subtle" color="dark" p={5}>
            <FontAwesomeIcon icon={faSearch} color={inkColor} />
          </Button>
        </Group>
      </Box>
    </>
  );

  return (
    <div style={{ width: '100%', maxWidth, margin: '0 auto', fontFamily: 'MedievalSharp, cursive' }}>

      {/* TOP ROLLER */}
      <div style={{ marginBottom: '-12px', position: 'relative', zIndex: 20 }}>
        <ScrollRoller />
      </div>

      {/* PARCHMENT BODY */}
      <Box
        style={{
          backgroundColor: raceColor,
          backgroundImage: paperTexture,
          padding: '30px 24px',
          boxShadow: '0 0 25px rgba(0,0,0,0.4)',
          position: 'relative',
          zIndex: 1,
          width: '92%', // Narrower than rollers
          margin: '0 auto',
          overflow: 'hidden',
          '--scroll-ink': inkColor,
          '--scroll-accent': accentColor,
        } as React.CSSProperties}
      >
        {scrollContent}
      </Box>

      {/* BOTTOM ROLLER */}
      <div style={{ marginTop: '-12px', position: 'relative', zIndex: 20 }}>
        <ScrollRoller />
      </div>

    </div>
  );
};

export default ScrollSidebar;
