import {
  faBell,
  faCoins,
  faEnvelope,
  faFistRaised,
  faShieldAlt,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Group, Stack, Text } from '@mantine/core';
import type { ComponentProps } from 'react';
import { useMemo } from 'react';

import { BattleLedger } from '@/components/BattleLedger';
import { BattleStatStrip } from '@/components/BattleStatStrip';
import CollapsibleSection from '@/components/CollapsibleSection';
import { GameCard } from '@/components/game/GameCard';
import { StatGrid } from '@/components/game/StatGrid';
import HeaderIconButton from '@/components/HeaderIconButton';
import HeroBanner from '@/components/HeroBanner';
import { OrnatePanel } from '@/components/OrnatePanel';
import { FortHealthStatSlot } from '@/components/overview/FortHealthStatSlot';
import type { ProfileStat } from '@/components/profile/ProfileStatTiles';
import { ProfileStatTiles } from '@/components/profile/ProfileStatTiles';
import {
  mockAction,
  ShowcaseSection,
  Specimen,
} from '@/components/showcase/Showcase';
import { ProtectionMeter } from '@/components/sidebar/ProtectionMeter';
import { SidebarTimeInfo, StatRow } from '@/components/sidebar/SidebarShared';
import StatCard from '@/components/StatCard';
import UserModel from '@/models/Users';
import { themes } from '@/styles/themes';
import type { PlayerRace } from '@/types/typings';
import type { ProtectionSummary } from '@/utils/battleProtection';

type StatGridStats = ComponentProps<typeof StatGrid>['stats'];
type BattleStats = ComponentProps<typeof BattleStatStrip>['stats'];

const RACES: PlayerRace[] = ['ELF', 'HUMAN', 'GOBLIN', 'UNDEAD'];

const KINGDOM_STATS: StatGridStats = [
  {
    label: 'Gold',
    value: '1,284,550',
    icon: faCoins,
    tooltip: 'Gold on hand, exposed to raids',
  },
  { label: 'Citizens', value: '3,412', icon: faUsers, isPositive: true },
  {
    label: 'Offense',
    value: '48,920',
    icon: faFistRaised,
    qualifier: 'with full stamina',
  },
  {
    label: 'Defense',
    value: '12,005',
    icon: faShieldAlt,
    isPositive: false,
    tooltip: 'Below your offense: you are exposed',
    qualifier: 'fort at 62%',
  },
];

const BATTLE_STATS: BattleStats = [
  { label: 'Turns used', value: 4, tone: 'normal' },
  { label: 'Gold stolen', value: '212,400', tone: 'gold' },
  { label: 'Units lost', value: '-318', tone: 'bad' },
  { label: 'XP earned', value: '+1,250', tone: 'good' },
];

const PROFILE_STATS: ProfileStat[] = [
  {
    key: 'attacks',
    label: 'Attacks won',
    value: '142',
    icon: 'crossed-swords',
  },
  { key: 'defends', label: 'Defends won', value: '87', icon: 'shield' },
  { key: 'rank', label: 'Overall rank', value: '#12', icon: 'trophy' },
  { key: 'level', label: 'Level', value: '34', icon: 'crown' },
  { key: 'fort', label: 'Fortification', value: 'Keep', icon: 'tower' },
  { key: 'home', label: 'Housing', value: 'Manor', icon: 'castle' },
];

const MOCK_PROTECTION: ProtectionSummary = {
  protected: true,
  reason: 'ACTIVE',
  endsAt: null,
  levelLimit: 10,
  level: 6,
  population: 1840,
  populationThreshold: 2600,
  forfeited: false,
  durationDays: 14,
  daysLeft: 4.6,
  timeRemainingShare: 0.33,
};

/** Builds a client-only mock player; nothing here touches the API. */
function buildMockUser(fortHitpoints: number): UserModel {
  // Built from a row so the model wires its stats service (fort health etc.).
  // No gold: the damaged slot's Repair Max stays disabled and never fetches.
  const user = new UserModel({
    id: 1,
    display_name: 'Lady Morwen',
    race: 'ELF',
    class: 'FIGHTER',
    experience: 25000,
    gold: 0n,
    gold_in_bank: 0n,
    fort_level: 3,
    fort_hitpoints: fortHitpoints,
  } as unknown as ConstructorParameters<typeof UserModel>[0]);
  user.locale = 'en-US';
  user.protection = MOCK_PROTECTION;
  return user;
}

function brandFor(race: PlayerRace) {
  const colors = themes[race]?.colors;
  return {
    brand: colors?.brand,
    secondary: colors?.secondary ?? colors?.brand,
  };
}

/** Cards, stat grids, banners and ledgers with mock kingdom data. */
export default function CardsSection() {
  const healthyUser = useMemo(() => buildMockUser(200), []);
  const damagedUser = useMemo(() => buildMockUser(124), []);

  return (
    <ShowcaseSection
      id="cards"
      title="Cards & stats"
      description="Frames, stat grids and kingdom banners that carry most in-game numbers."
    >
      <Specimen
        framed={false}
        name="GameCard (goldAccent)"
        usedOn={['/home/overview', '/battle/users', '/structures/bank/deposit']}
        note="Default. goldAccent frames a page's primary, standalone or actionable cards and the outcome card of a report. Never toggle it to show which side won; say that with a badge or tone. The card title is a section heading (h2) and never repeats the MainArea page title."
      >
        <GameCard
          title="War Council"
          icon={faFistRaised}
          action={
            <Button
              size="xs"
              variant="light"
              onClick={mockAction('Open war council')}
            >
              Convene
            </Button>
          }
        >
          <Text size="sm">
            Your generals await orders. Train soldiers before the next turn.
          </Text>
        </GameCard>
      </Specimen>

      <Specimen
        framed={false}
        name="GameCard (plain)"
        usedOn={[
          '/home/settings',
          '/social/friends',
          '/battle/battleSimulator',
        ]}
        note="goldAccent={false} for supporting panels beside or under a primary card: report side panels, logs, sidebar widgets."
      >
        <GameCard
          title="Treasury"
          icon={faCoins}
          goldAccent={false}
          action={
            <Button
              size="xs"
              variant="subtle"
              onClick={mockAction('Deposit gold')}
            >
              Deposit
            </Button>
          }
        >
          <Text size="sm">3 deposits remaining today.</Text>
        </GameCard>
      </Specimen>

      <Specimen
        framed={false}
        name="StatGrid"
        usedOn={[
          '/structures/housing',
          '/battle/training',
          '/structures/repair',
        ]}
        note="Hover or focus Gold and Defense for tooltips; qualifiers show on touch viewports."
      >
        <StatGrid
          title="Kingdom"
          icon={faShieldAlt}
          stats={KINGDOM_STATS}
          columns={2}
        />
      </Specimen>

      <Specimen
        framed={false}
        name="StatCard"
        note="Not currently rendered by any page."
      >
        <Stack gap="sm">
          <StatCard
            title="Gold per turn"
            value={18450}
            icon={<FontAwesomeIcon icon={faCoins} />}
          />
          <StatCard
            title="Population"
            value={3412}
            variant="highlight"
            subtext="+120 citizens per day"
            icon={<FontAwesomeIcon icon={faUsers} />}
          />
          <StatCard
            title="Attack turns"
            value={42}
            variant="pulse"
            iconPosition="left"
            icon={<FontAwesomeIcon icon={faFistRaised} />}
          />
        </Stack>
      </Specimen>

      {RACES.map((race) => {
        const { brand, secondary } = brandFor(race);
        return (
          <Specimen
            framed={false}
            key={race}
            name={`HeroBanner (${race})`}
            usedOn={['/home/overview']}
            wide
          >
            <HeroBanner
              race={race}
              clothTop={brand?.[7]}
              clothBottom={brand?.[9]}
              trimA={secondary?.[2]}
              trimB={secondary?.[5]}
              trimC={secondary?.[2]}
              title={
                <>
                  <span className="text-white">Lady Morwen</span> is a{' '}
                  <span style={{ color: 'var(--ot-heading)' }}>
                    level 34 {race} Fighter
                  </span>
                </>
              }
              subtitle="Rank #12 of the realm"
            />
          </Specimen>
        );
      })}

      <Specimen
        framed={false}
        name="OrnatePanel"
        usedOn={['/battle/results/[id]']}
      >
        <OrnatePanel minHeight={140}>
          <Text size="sm">
            Padded, isolated stage for battle report content.
          </Text>
        </OrnatePanel>
      </Specimen>

      <Specimen name="CollapsibleSection" usedOn={['sidebar (all game pages)']}>
        <Stack gap="xs">
          <CollapsibleSection title="Recent battles" defaultOpen>
            <Text size="sm">
              You repelled Grukk the Vile and lost 12 sentries.
            </Text>
          </CollapsibleSection>
          <CollapsibleSection title="Advisor notes">
            <Text size="sm">
              Build housing before your citizens grow restless.
            </Text>
          </CollapsibleSection>
        </Stack>
      </Specimen>

      <Specimen
        name="BattleLedger + BattleStatStrip"
        usedOn={['/battle/results/[id]', '/battle/battleSimulator']}
        note="The one stat-tile strip. Tones come from STAT_TONES (--ot-heading, --ot-text, Mantine green/red), so they retint per race; the simulator army forms use the normal tone."
        wide
      >
        <BattleLedger>
          <Stack gap="md">
            <Text ff="MedievalSharp, serif" size="lg" c="var(--ot-heading)">
              The siege of Thornwall
            </Text>
            <BattleStatStrip stats={BATTLE_STATS} />
          </Stack>
        </BattleLedger>
      </Specimen>

      <Specimen
        name="HeaderIconButton"
        usedOn={['MainArea header (all game pages)', 'mobile navigation']}
      >
        <Group gap="md">
          <HeaderIconButton
            label="Messages"
            count={3}
            onClick={mockAction('Open messages')}
          >
            <FontAwesomeIcon icon={faEnvelope} />
          </HeaderIconButton>
          <HeaderIconButton
            label="Notifications"
            count={128}
            onClick={mockAction('Open notifications')}
          >
            <FontAwesomeIcon icon={faBell} />
          </HeaderIconButton>
          <HeaderIconButton
            label="Defenses"
            onClick={mockAction('Open defenses')}
          >
            <FontAwesomeIcon icon={faShieldAlt} />
          </HeaderIconButton>
        </Group>
      </Specimen>

      <Specimen name="ProfileStatTiles" usedOn={['/userprofile/[id]']}>
        <ProfileStatTiles stats={PROFILE_STATS} />
      </Specimen>

      <Specimen
        name="StatRow (classic / scroll)"
        usedOn={['sidebar (all game pages)']}
        note="Classic draws black labels for the parchment sidebar."
      >
        <Stack
          gap="xs"
          p="sm"
          style={{
            background: 'var(--ot-parchment, #e8dcb5)',
            borderRadius: 4,
          }}
        >
          <StatRow
            label="Gold"
            value="1,284,550"
            icon={<FontAwesomeIcon icon={faCoins} />}
          />
          <StatRow
            label="Citizens"
            value="3,412"
            icon={<FontAwesomeIcon icon={faUsers} />}
          />
        </Stack>
        <Stack gap="xs" mt="sm">
          <StatRow
            variant="scroll"
            inkColor="var(--ot-heading)"
            label="Turns"
            value="42"
          />
          <StatRow
            variant="scroll"
            inkColor="var(--ot-heading)"
            label="Level"
            value={<Text fw={700}>34</Text>}
          />
        </Stack>
      </Specimen>

      <Specimen
        name="SidebarTimeInfo"
        usedOn={['sidebar (all game pages)', 'mobile sidebar']}
      >
        <Stack gap="md">
          <SidebarTimeInfo user={healthyUser} userLoading={false} />
          <SidebarTimeInfo user={healthyUser} userLoading={false} compact />
        </Stack>
      </Specimen>

      <Specimen
        name="ProtectionMeter"
        usedOn={['sidebar (all game pages)', 'mobile sidebar']}
      >
        <ProtectionMeter user={healthyUser} />
      </Specimen>

      <Specimen
        name="FortHealthStatSlot"
        usedOn={['/home/overview']}
        note="Damaged copy has no gold, so Repair Max stays disabled and never calls the API."
      >
        <Stack gap="sm">
          <FortHealthStatSlot user={healthyUser} />
          <FortHealthStatSlot user={damagedUser} />
        </Stack>
      </Specimen>
    </ShowcaseSection>
  );
}
