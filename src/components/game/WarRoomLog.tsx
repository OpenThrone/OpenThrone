import { faSkullCrossbones } from '@fortawesome/free-solid-svg-icons';
import { Badge, Box, ScrollArea, Table, useMantineTheme } from '@mantine/core';
import React from 'react';

import { GameCard } from './GameCard';

const BATTLES = [
  {
    id: 1,
    attacker: 'DasTacoMann',
    defender: 'uaktags',
    result: 'VICTORY',
    gold: 12500,
    time: '2m ago',
  },
  {
    id: 2,
    attacker: 'IronBreaker',
    defender: 'uaktags',
    result: 'DEFEAT',
    gold: -5400,
    time: '15m ago',
  },
  {
    id: 3,
    attacker: 'uaktags',
    defender: 'ShadowWeaver',
    result: 'VICTORY',
    gold: 8900,
    time: '1h ago',
  },
];

export const WarRoomLog = () => {
  const theme = useMantineTheme();
  const brand = theme.colors.brand ?? theme.colors.blue;
  const secondary = theme.colors.secondary ?? theme.colors.yellow;
  const accent = secondary[4] ?? '#e5c55a';
  const gridLine = brand[7] ?? '#3b82f6';
  console.log('WarRoomLog theme colors:', theme.colors);
  console.log('Accent color:', accent);
  const withAlpha = (hex: string, alpha: string) =>
    hex.startsWith('#') && hex.length === 7 ? `${hex}${alpha}` : hex;

  return (
    <GameCard title="War Room Logs" icon={faSkullCrossbones}>
      <Box
        style={{
          backgroundImage: `
            linear-gradient(${withAlpha(gridLine, '1f')} 1px, transparent 1px),
            linear-gradient(90deg, ${withAlpha(gridLine, '1f')} 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
          backgroundColor: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '4px',
          height: '300px', // Fixed height for scrolling
          position: 'relative',
        }}
      >
        {/* "Scan Line" Animation (Optional cool effect) */}
        <Box
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: withAlpha(brand[4] ?? '#22c55e', '4d'),
            boxShadow: `0 0 10px ${withAlpha(brand[4] ?? '#22c55e', '80')}`,
            zIndex: 1,
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        />

        <ScrollArea h="100%">
          <Table verticalSpacing="xs">
            <Table.Thead
              style={{
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(2px)',
              }}
            >
              <Table.Tr>
                <Table.Th style={{ color: '#6e7681', fontFamily: 'monospace' }}>
                  STATUS
                </Table.Th>
                <Table.Th style={{ color: '#6e7681', fontFamily: 'monospace' }}>
                  OPPONENT
                </Table.Th>
                <Table.Th style={{ color: '#6e7681', fontFamily: 'monospace' }}>
                  GAINS
                </Table.Th>
                <Table.Th
                  style={{
                    color: '#6e7681',
                    fontFamily: 'monospace',
                    textAlign: 'right',
                  }}
                >
                  TIMESTAMP
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {BATTLES.map((battle) => (
                <Table.Tr
                  key={battle.id}
                  style={{
                    borderBottom: '1px dashed #30363d',
                    transition: 'background 0.15s',
                  }}
                >
                  <Table.Td>
                    <Badge
                      variant="dot"
                      color={battle.result === 'VICTORY' ? 'brand' : 'red'}
                      bg="transparent"
                      style={{ fontFamily: 'monospace' }}
                    >
                      {battle.result}
                    </Badge>
                  </Table.Td>
                  <Table.Td
                    style={{
                      color: '#c9d1d9',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                    }}
                  >
                    {battle.attacker === 'uaktags'
                      ? `vs ${battle.defender}`
                      : `def ${battle.attacker}`}
                  </Table.Td>
                  <Table.Td
                    style={{
                      color: battle.gold > 0 ? accent : '#f85149',
                      fontFamily: 'monospace',
                    }}
                  >
                    {battle.gold > 0 ? '+' : ''}
                    {battle.gold.toLocaleString()}
                  </Table.Td>
                  <Table.Td
                    style={{
                      color: '#8b949e',
                      fontFamily: 'monospace',
                      textAlign: 'right',
                    }}
                  >
                    {battle.time}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Box>
    </GameCard>
  );
};

export default WarRoomLog;
