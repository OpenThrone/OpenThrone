import React from 'react';
import { Paper, Text, Group, Stack, RingProgress, Center, Box, Divider } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCoins, faChessRook } from '@fortawesome/free-solid-svg-icons';

interface SidebarDarkProps {
  sidebarData: any; // Pass your sidebar data here
}

export const SidebarDark: React.FC<SidebarDarkProps> = ({ sidebarData }) => {

  return (
    <Paper
      radius="md"
      p="lg"
      style={{
        backgroundColor: '#0f1216', // Deep dark matches your MainArea
        border: '1px solid #2f3e52',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        color: '#9ca3af',
        fontFamily: 'sans-serif'
      }}
    >
      {/* HEADER */}
      <Box
        pb="md"
        mb="md"
        style={{
          borderBottom: '1px solid #2f3e52',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px'
        }}
      >
        <Text c="#e5c55a">⚜</Text>
        <Text
          c="#e5c55a"
          fw={700}
          style={{
            fontFamily: 'MedievalSharp, serif',
            fontSize: '18px',
            letterSpacing: '1px',
            textTransform: 'uppercase'
          }}
        >
          ADVISOR
        </Text>
        <Text c="#e5c55a">⚜</Text>
      </Box>

      {/* ADVISOR QUOTE */}
      <Box
        p="sm"
        mb="xl"
        style={{
          background: 'rgba(255,255,255,0.03)',
          borderLeft: '3px solid #e5c55a',
          borderRadius: '0 4px 4px 0'
        }}
      >
        <Text size="sm" fs="italic" c="gray.5" style={{ lineHeight: 1.5 }}>
          &ldquo;Construct a Bank to protect your gold from enemy raids.&rdquo;
        </Text>
      </Box>

      {/* TURN COUNTER (Ring) */}
      <Center mb="xl">
        <Box pos="relative">
          <RingProgress
            size={140}
            thickness={8}
            roundCaps
            sections={[
              { value: 50, color: '#e5c55a' }
            ]}
            label={
              <Center>
                <Stack gap={0} align="center">
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '1px' }}>TURNS</Text>
                  <Text size="xl" fw={800} c="white">12345</Text>
                </Stack>
              </Center>
            }
          />
        </Box>
      </Center>

      {/* STATS LIST */}
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="sm">
            <FontAwesomeIcon icon={faCoins} style={{ color: '#e5c55a' }} />
            <Text size="sm" fw={600} c="gray.4">Gold</Text>
          </Group>
          <Text size="sm" c="white" fw={700} style={{ fontFamily: 'monospace' }}>
            876,543,210
          </Text>
        </Group>

        <Divider color="#2f3e52" />

        <Group justify="space-between">
          <Group gap="sm">
            <FontAwesomeIcon icon={faChessRook} style={{ color: '#60a5fa' }} />
            <Text size="sm" fw={600} c="gray.4">Level</Text>
          </Group>
          <Text size="sm" c="white" fw={700} style={{ fontFamily: 'monospace' }}>
            32
          </Text>
        </Group>
      </Stack>

    </Paper>
  );
};

export default SidebarDark;
