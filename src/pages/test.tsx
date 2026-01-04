'use client';

import MainArea from '@/components/MainArea';
import { faScroll } from '@fortawesome/free-solid-svg-icons';
import { UnitTrainingPanel } from '@/components/game/UnitTrainingPanel';
import { WarRoomLog } from '@/components/game/WarRoomLog';
import { GameCard } from '@/components/game/GameCard';
import {
  Table,
  Box,
  Paper,
  Text,
  Avatar,
  Group,
  Badge,
  ScrollArea,
  rem,
  SimpleGrid
} from '@mantine/core';

// --- Types & Mock Data ---
interface PlayerData {
  rank: number;
  name: string;
  race: string;
  gold: string;
  level: number;
  active: boolean;
  avatar: string;
}

const PLAYERS: PlayerData[] = [
  { rank: 1, name: 'DasTacoMann', race: 'HUMAN FIGHTER', gold: '49,063,738', level: 42, active: false, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix' },
  { rank: 2, name: 'uaktags', race: 'UNDEAD ROGUE', gold: '8,662,220', level: 42, active: true, avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Aneka' },
  { rank: 3, name: 'IronBreaker', race: 'DWARF PALADIN', gold: '5,100,432', level: 41, active: false, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack' },
  { rank: 4, name: 'ShadowWeaver', race: 'ELF MAGE', gold: '4,888,100', level: 40, active: false, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lola' },
  { rank: 5, name: 'BloodRaven', race: 'ORC WARRIOR', gold: '4,102,999', level: 39, active: false, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bo' },
];

// --- 1. THE WARLORD TABLE (Direct Style Match) ---
export function WarlordTable() {
  const rows = PLAYERS.map((player) => (
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
          {/* Hex/Tech Avatar Border */}
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
        backgroundColor: '#131b29', // Deep navy background
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
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)', // Top highlight
        }}
      >
        <Text
          style={{
            fontFamily: 'serif', // Or your game font
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
}

// --- 2. INVENTORY STYLE (Inset Depths) ---
export function InventoryTable() {
  return (
    <Box
      p="xs"
      style={{
        background: '#1a1d21',
        borderRadius: '6px',
        border: '1px solid #333',
        boxShadow: 'inset 0 0 15px #000'
      }}
    >
      <Table style={{ borderCollapse: 'separate', borderSpacing: '0 4px' }}>
        <Table.Tbody>
          {PLAYERS.map((p) => (
            <Table.Tr
              key={p.name}
              style={{
                backgroundColor: '#111418',
                boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.05)',
                border: '1px solid #000',
              }}
            >
              <Table.Td style={{ border: 'none', color: '#555' }}>#{p.rank}</Table.Td>
              <Table.Td style={{ border: 'none' }}>
                <Group>
                  <Avatar src={p.avatar} size="sm" radius="md" style={{ filter: 'grayscale(100%)' }} />
                  <Text size="sm" c="gray.4" fw={600}>{p.name}</Text>
                </Group>
              </Table.Td>
              <Table.Td style={{ border: 'none', color: '#888' }}>{p.gold}</Table.Td>
              <Table.Td style={{ border: 'none' }}>
                <Badge variant="outline" color="gray" size="sm">Lvl {p.level}</Badge>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

// Default export renders the Warlord table, with the Inventory one below for preview
export default function GameTableDemo(props) {
  return (
    <MainArea title="Command Center">
      <div className="mx-auto w-full max-w-7xl">

        {/* Top Row: Quick Stats & Advisor */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="lg">
          <GameCard title="Advisor" icon={faScroll}>
            <div className="p-4 text-gray-300 italic">
              "My Liege, the goblins are massing near the border. We should train more Archers."
            </div>
          </GameCard>
          <WarRoomLog /* Make this full width or 2x the normal width */
          />
          <InventoryTable />
          <WarlordTable />
        </SimpleGrid>

        {/* Bottom Row: Actions */}
        <UnitTrainingPanel />

      </div>
    </MainArea>
  );
}