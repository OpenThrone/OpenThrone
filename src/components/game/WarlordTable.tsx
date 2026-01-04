import React from 'react';
import {
  Table,
  Box,
  Paper,
  Text,
  Avatar,
  Group,
  Badge,
  ScrollArea,
  rem
} from '@mantine/core';

// --- Types ---
export interface PlayerData {
  rank: number;
  name: string;
  race: string;
  gold: string;
  level: number;
  active: boolean;
  avatar: string;
}

interface WarlordTableProps {
  players?: PlayerData[]; // Optional prop to pass data in
}

// --- Default Mock Data (if no props provided) ---
const DEFAULT_PLAYERS: PlayerData[] = [
  { rank: 1, name: 'DasTacoMann', race: 'HUMAN FIGHTER', gold: '49,063,738', level: 42, active: false, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
  { rank: 2, name: 'uaktags', race: 'UNDEAD ROGUE', gold: '8,662,220', level: 42, active: true, avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Aneka' },
  { rank: 3, name: 'IronBreaker', race: 'DWARF PALADIN', gold: '5,100,432', level: 41, active: false, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack' },
  { rank: 4, name: 'ShadowWeaver', race: 'ELF MAGE', gold: '4,888,100', level: 40, active: false, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lola' },
  { rank: 5, name: 'BloodRaven', race: 'ORC WARRIOR', gold: '4,102,999', level: 39, active: false, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bo' },
];

export const WarlordTable: React.FC<WarlordTableProps> = ({ players = DEFAULT_PLAYERS }) => {
  const rows = players.map((player) => (
    <Table.Tr
      key={player.name}
      style={{
        // Gradient creates volume for the row
        background: player.active
          ? 'linear-gradient(90deg, rgba(29, 78, 216, 0.25) 0%, transparent 100%)'
          : 'transparent',
        transition: 'background 0.2s ease',
      }}
    >
      <Table.Td style={{ borderColor: '#1f2b3b' }}>
        <Text fw={700} c="dimmed" size="sm">#{player.rank}</Text>
      </Table.Td>

      <Table.Td style={{ borderColor: '#1f2b3b' }}>
        <Group gap="sm">
          {/* Hex/Tech Avatar Frame */}
          <Box style={{ border: '1px solid #444', padding: '1px', background: '#000' }}>
            <Avatar src={player.avatar} size={30} radius={0} />
          </Box>
          <Box>
            <Text size="sm" fw={700} c={player.active ? 'blue.3' : 'white'}>
              {player.name} {player.active && <Badge size="xs" radius="xs" color="blue" ml={5}>YOU</Badge>}
            </Text>
            <Text size="xs" c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {player.race}
            </Text>
          </Box>
        </Group>
      </Table.Td>

      <Table.Td style={{ borderColor: '#1f2b3b', color: '#687b94' }}>-</Table.Td>

      <Table.Td style={{ borderColor: '#1f2b3b' }}>
        <Text c="#e5c55a" fw={600} size="sm">{player.gold}</Text>
      </Table.Td>

      <Table.Td style={{ borderColor: '#1f2b3b' }}>
        <Text c="white" fw={700} size="sm">{player.level}</Text>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Paper
      radius="sm"
      style={{
        backgroundColor: '#131b29', // Deep navy background matching your screenshot
        border: '1px solid #2f3e52', // Border matches nav dividers
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}
    >
      {/* HEADER: Beveled Gradient + Gold Border */}
      <Box
        py="sm"
        px="lg"
        style={{
          background: 'linear-gradient(180deg, #253346 0%, #1a2533 100%)',
          borderBottom: '2px solid #e5c55a', // The "Game" Gold Accent
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)', // Top highlight for 3D bevel effect
        }}
      >
        <Text
          style={{
            fontFamily: 'MedievalSharp, serif', // Matches your theme
            color: '#e5c55a',
            fontWeight: 700,
            letterSpacing: '1px',
            fontSize: rem(20),
            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
          }}
        >
          Attack Users
        </Text>
        <Badge color="red" variant="filled" radius="sm" tt="uppercase">
          PvP Zone
        </Badge>
      </Box>

      <ScrollArea>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr style={{ background: '#0e1520' }}>
              {['Rank', 'Username', 'Alliance', 'Gold', 'Level'].map((head) => (
                <Table.Th
                  key={head}
                  style={{
                    color: '#687b94',
                    borderBottom: '1px solid #2f3e52',
                    textTransform: 'uppercase',
                    fontSize: '11px',
                    letterSpacing: '1px',
                    paddingTop: rem(12),
                    paddingBottom: rem(12),
                  }}
                >
                  {head}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
};

export default WarlordTable;