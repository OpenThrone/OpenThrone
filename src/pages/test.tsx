'use client';

import { faScroll } from '@fortawesome/free-solid-svg-icons';
import { Box, Group, SegmentedControl, SimpleGrid, Text } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';

// --- REMOVED: Old Components that didn't fit the theme ---
// import ContentCard from '@/components/ContentCard';
// import LossesList from '@/components/LossesList';
// import NewsAccordion from '@/components/newsAccordion';
// import StatCard from '@/components/StatCard';
// import StatsTable from '@/components/statsTable';
// import TabbedContent from '@/components/TabbedContent';
// import ThemedCard from '@/components/themedCard';
// import { NeumorphicTable } from '@/components/NumericTable';
// import { PaperTable } from '@/components/PaperTable';
// --- KEPT/ADDED: The New Design System ---
import { GameCard } from '@/components/game/GameCard';
import { StatGrid } from '@/components/game/StatGrid';
import { StyledContent } from '@/components/game/StyledContent';
import { StyledLosses } from '@/components/game/StyledLosses';
import { StyledNews } from '@/components/game/StyledNews';
import { UnitTrainingPanel } from '@/components/game/UnitTrainingPanel';
import { type PlayerData, WarlordTable } from '@/components/game/WarlordTable';
import { WarRoomLog } from '@/components/game/WarRoomLog';
import MainArea from '@/components/MainArea';
import type { PlayerRace } from '@/types/typings';

// --- Types & Mock Data ---
const PLAYERS: PlayerData[] = [
  {
    rank: 1,
    name: 'DasTacoMann',
    race: 'HUMAN FIGHTER',
    gold: '49,063,738',
    level: 42,
    active: false,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  },
  {
    rank: 2,
    name: 'uaktags',
    race: 'UNDEAD ROGUE',
    gold: '8,662,220',
    level: 42,
    active: true,
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Aneka',
  },
  {
    rank: 3,
    name: 'IronBreaker',
    race: 'GOBLIN SHAMAN',
    gold: '5,100,432',
    level: 41,
    active: false,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack',
  },
  {
    rank: 4,
    name: 'ShadowWeaver',
    race: 'ELF MAGE',
    gold: '4,888,100',
    level: 40,
    active: false,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lola',
  },
  {
    rank: 5,
    name: 'BloodRaven',
    race: 'HUMAN CLERIC',
    gold: '4,102,999',
    level: 39,
    active: false,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bo',
  },
];

const NEWS_ITEMS = [
  {
    id: 1,
    title: 'Siege of the Northwatch',
    content:
      'Scouts report movement along the northern ridge. War parties gather beyond the pass.',
    created_timestamp: new Date().toISOString(),
    read: false,
  },
  {
    id: 2,
    title: 'Guild Treasury Grows',
    content:
      'The treasury swells with fresh tribute. Consider investing in fortifications.',
    created_timestamp: new Date(Date.now() - 86400000).toISOString(),
    read: true,
  },
];

const LOSS_SAMPLE = JSON.stringify({
  total: 312,
  units: [
    { level: 2, type: 'Infantry', quantity: 140 },
    { level: 3, type: 'Archer', quantity: 112 },
    { level: 1, type: 'Infantry', quantity: 60 },
  ],
});

// Default export renders the Warlord table, with the Inventory one below for preview
/** Game table demo. */
export default function GameTableDemo() {
  const [previewScheme, setPreviewScheme] = useLocalStorage<PlayerRace | ''>({
    key: 'colorSchemePreview',
    defaultValue: '',
  });
  const raceOptions = [
    { value: 'ACCOUNT', label: 'Account' },
    { value: 'ELF', label: 'Elf' },
    { value: 'HUMAN', label: 'Human' },
    { value: 'GOBLIN', label: 'Goblin' },
    { value: 'UNDEAD', label: 'Undead' },
  ];
  const activeScheme = raceOptions.some(
    (option) => option.value === previewScheme,
  )
    ? (previewScheme as string)
    : 'ACCOUNT';

  return (
    <MainArea title="Command Center">
      <div className="mx-auto w-full max-w-7xl">
        <Box mb="lg">
          <GameCard title="Theme Switcher" goldAccent={false}>
            <Group justify="space-between" align="center">
              <Box>
                <Text size="sm" fw={600} c="gray.2">
                  Race Theme
                </Text>
                <Text size="xs" c="dimmed">
                  Swap the global Mantine theme to preview each race.
                </Text>
              </Box>
              <SegmentedControl
                value={activeScheme}
                onChange={(value) =>
                  setPreviewScheme(
                    value === 'ACCOUNT' ? '' : (value as PlayerRace),
                  )
                }
                data={raceOptions}
                radius="sm"
                withItemsBorders={false}
                color="brand"
              />
            </Group>
          </GameCard>
        </Box>

        {/* Top Row: Quick Stats & Advisor */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="lg">
          <GameCard title="Advisor" icon={faScroll}>
            <div className="p-4 italic text-gray-300">
              &ldquo;My Liege, the goblins are massing near the border. We
              should train more Archers.&rdquo;
            </div>
          </GameCard>

          {/* Using the new Locked-In Stat Grid */}
          <StatGrid
            title="Status Report"
            stats={[
              { label: 'Gold', value: '8,450,200', icon: '🪙' },
              { label: 'Population', value: '12,450', icon: '👥' },
              { label: 'Army Size', value: '4,200', icon: '⚔️' },
              { label: 'Morale', value: '94%', icon: '❤️', isPositive: true },
            ]}
            columns={2}
          />
        </SimpleGrid>

        {/* Row: Key Action Panels */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="lg">
          <WarRoomLog />
          <WarlordTable players={PLAYERS} />
        </SimpleGrid>

        {/* Row: Training & Content */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="lg">
          {/* Styled Content (Replaces ContentCard) */}
          <StyledContent
            title="Quest Log"
            content="Pledges have arrived from allied houses. Record the deposits and review the vault locks."
            badgeText="Urgent"
          />

          {/* Additional Stat Grid example for consistency */}
          <StatGrid
            title="Supply Status"
            stats={[
              { label: 'Food', value: '85%', icon: '🍞' },
              { label: 'Weapons', value: '92%', icon: '🗡️' },
              { label: 'Wood', value: '40%', icon: '🪵', isPositive: false },
              { label: 'Stone', value: '65%', icon: '🪨' },
            ]}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 1 }} spacing="lg" mb="lg">
          <UnitTrainingPanel />
        </SimpleGrid>

        {/* Row: Information & Intel */}
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="lg">
          <StyledNews news={NEWS_ITEMS} />
          <StyledLosses losses={LOSS_SAMPLE} />
        </SimpleGrid>
      </div>
    </MainArea>
  );
}
