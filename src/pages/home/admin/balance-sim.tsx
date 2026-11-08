import {
  faBalanceScale,
  faChartLine,
  faCoins,
  faCrosshairs,
  faPlay,
  faSkullCrossbones,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Button,
  Divider,
  Grid,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import type { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ADMIN_CHART_PALETTE,
  ADMIN_CHART_TOOLTIP_STYLE,
} from '@/components/admin/adminColors';
import { AdminDataTable } from '@/components/admin/AdminDataTable';
import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';
import { PermissionType } from '@/lib/prisma-browser-exports';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { alertService } from '@/services/Alert.service';
import { getDefaultBattleConstants } from '@/utils/attackFunctions';
import { isAdmin, isImpersonatedSession } from '@/utils/authorization';

interface SimConfig {
  populationSize: number;
  levelRange: [number, number];
  days: number;
  turnIntervalMinutes: number;
  newPlayerIntervalDays: number;
  newPlayersPerInterval: number;
  attackLevelRange: number;
  activityMix: Record<ActivityType, number>;
  event: SimEventConfig;
  dungeon: boolean;
  alliances: { share: number; size: number };
  balance: {
    attackerDamageMultiplier?: number;
    defenderCounterDamageMultiplier?: number;
    maxPillageSharePerAttack?: number;
    damageVarianceMin?: number;
    damageVarianceMax?: number;
  };
  seed?: number;
}

type ActivityType = 'casual' | 'regular' | 'active' | 'grinder';

interface SimEventConfig {
  enabled: boolean;
  startDay: number;
  days: number;
  xpMultiplier: number;
  goldMultiplier: number;
  extraTurnsPerTick: number;
  citizenMultiplier: number;
  unitCostDiscountPercent: number;
  armoryCostDiscountPercent: number;
}

const EVENT_FIELDS: Array<{
  key: Exclude<keyof SimEventConfig, 'enabled'>;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'startDay', label: 'Starts on day', min: 1, max: 365, step: 1 },
  { key: 'days', label: 'Lasts (days)', min: 1, max: 365, step: 1 },
  { key: 'xpMultiplier', label: 'XP ×', min: 0.1, max: 10, step: 0.1 },
  {
    key: 'goldMultiplier',
    label: 'Gold per turn ×',
    min: 0.1,
    max: 10,
    step: 0.1,
  },
  {
    key: 'extraTurnsPerTick',
    label: 'Extra turns per tick',
    min: 0,
    max: 10,
    step: 1,
  },
  {
    key: 'citizenMultiplier',
    label: 'Citizens ×',
    min: 0.1,
    max: 10,
    step: 0.1,
  },
  {
    key: 'unitCostDiscountPercent',
    label: 'Training discount %',
    min: 0,
    max: 25,
    step: 1,
  },
  {
    key: 'armoryCostDiscountPercent',
    label: 'Armory discount %',
    min: 0,
    max: 25,
    step: 1,
  },
];

const ACTIVITY_OPTIONS: Array<{
  value: ActivityType;
  label: string;
  description: string;
}> = [
  {
    value: 'casual',
    label: 'Casual',
    description: '1-2 logins a day, does a third of the recruit clicks',
  },
  {
    value: 'regular',
    label: 'Regular',
    description: '3-5 logins a day',
  },
  {
    value: 'active',
    label: 'Active',
    description: '8-12 logins a day',
  },
  {
    value: 'grinder',
    label: 'Grinder',
    description: 'Online all day, attacks with every turn for XP',
  },
];

interface ActivitySummary {
  activity: ActivityType;
  players: number;
  sessionsPerDay: number;
  attacksPerDay: number;
  attackWinRate: number;
  defenseWinRate: number;
  turnsSpentShare: number;
  lootGainedPerDay: number;
  lootLostPerDay: number;
  medianLevelsGained: number;
  medianXpPerDay: number;
  fastestXpPerDay: number;
  medianDaysToLevel100: number | null;
  fastestDaysToLevel100: number | null;
  avgMorale: number;
  armedShare: number;
  desertedPerDay: number;
}

interface UnitCounts {
  soldier: number;
  knight: number;
  berserker: number;
  guard: number;
  archer: number;
  royalGuard: number;
  spy: number;
  infiltrator: number;
  assassin: number;
  sentry: number;
  sentinel: number;
  inquisitor: number;
  citizen: number;
  worker: number;
}

interface PlayerProgressSnapshot {
  day: number;
  level: number;
  xp: number;
  gold: number;
  goldInBank: number;
  power: number;
  fortHp: number;
  fortMaxHp: number;
  attackTurns: number;
  units: UnitCounts;
  spyLevel: number;
  sentryLevel: number;
  economyLevel: number;
}

interface PlayerProgressReport {
  id: string;
  displayName: string;
  level: number;
  gold: number;
  goldInBank: number;
  power: number;
  status: string;
  started: PlayerProgressSnapshot;
  final: PlayerProgressSnapshot;
  checkpoints: PlayerProgressSnapshot[];
  deltas: {
    level: number;
    xp: number;
    liquidGold: number;
    bankGold: number;
    totalGold: number;
    power: number;
    offenseUnits: number;
    defenseUnits: number;
    spyUnits: number;
    sentryUnits: number;
    workers: number;
  };
}

interface SimResult {
  config: SimConfig & {
    effectiveBalance: {
      attackerDamageMultiplier: number;
      defenderCounterDamageMultiplier: number;
      maxPillageSharePerAttack: number;
      damageVarianceMin: number;
      damageVarianceMax: number;
    };
  };
  summary: {
    totalDays: number;
    totalAttacks: number;
    avgAttackerWinRate: number;
    avgDefenderWinRate: number;
    avgAttacksPerDay: number;
    avgLootPerDay: number;
    totalLoot: number;
    totalAttackerCasualties: number;
    totalDefenderCasualties: number;
    totalPlayers: number;
    finalBreachedPlayers: number;
    totalFortBreaches: number;
    maxLevel: number;
    avgLevel: number;
    avgAttackTurnsHeld: number;
    totalXpAwarded: number;
    avgXpPerDay: number;
    avgXpPerSpentTurn: number;
    pacingPlayerId: string | null;
    pacingPlayerName: string | null;
    projectedDaysToLevel100: number | null;
    projectedMonthsToLevel100: number | null;
    mercenariesHired: number;
    captivesTaken: number;
  };
  byActivity: ActivitySummary[];
  dailyResults: any[];
  charts: {
    winRates: { day: number; attacker: number; defender: number }[];
    economy: {
      day: number;
      totalGold: number;
      lootPerDay: number;
      turnIncome: number;
    }[];
    population: {
      day: number;
      players: number;
      breached: number;
      avgHeldTurns: number;
    }[];
    attacks: {
      day: number;
      total: number;
      lowTurn: number;
      highTurn: number;
      turnsGenerated: number;
      turnsSpent: number;
    }[];
  };
  topPlayers: {
    id: string;
    displayName: string;
    level: number;
    gold: number;
    power: number;
    status: string;
    activity?: ActivityType;
  }[];
  playerProgress: PlayerProgressReport[];
  timing: {
    elapsedMs: number;
    elapsedSeconds: number;
    avgMsPerDay: number;
    startedAt: string;
    finishedAt: string;
    slowestDays: { day: number; elapsedMs: number; attacks: number }[];
  };
}

const BALANCE_PRESETS: Record<string, Partial<SimConfig['balance']>> = {
  current: {},
  equilibrium: {
    attackerDamageMultiplier: 1.148,
    defenderCounterDamageMultiplier: 0.8,
    maxPillageSharePerAttack: 0.22,
    damageVarianceMin: 0.92,
    damageVarianceMax: 1.08,
  },
  attacker_favored: {
    attackerDamageMultiplier: 1.35,
    defenderCounterDamageMultiplier: 0.65,
    maxPillageSharePerAttack: 0.3,
    damageVarianceMin: 0.88,
    damageVarianceMax: 1.12,
  },
  defender_favored: {
    attackerDamageMultiplier: 1.0,
    defenderCounterDamageMultiplier: 1.0,
    maxPillageSharePerAttack: 0.25,
    damageVarianceMin: 0.92,
    damageVarianceMax: 1.08,
  },
  high_variance: {
    attackerDamageMultiplier: 1.2,
    defenderCounterDamageMultiplier: 0.85,
    maxPillageSharePerAttack: 0.4,
    damageVarianceMin: 0.75,
    damageVarianceMax: 1.25,
  },
};

const defaultConfig: SimConfig = {
  populationSize: 100,
  levelRange: [5, 20],
  days: 30,
  turnIntervalMinutes: 30,
  newPlayerIntervalDays: 0,
  newPlayersPerInterval: 5,
  attackLevelRange: 5,
  activityMix: { casual: 40, regular: 35, active: 20, grinder: 5 },
  event: {
    enabled: false,
    startDay: 1,
    days: 2,
    xpMultiplier: 2,
    goldMultiplier: 1,
    extraTurnsPerTick: 0,
    citizenMultiplier: 1,
    unitCostDiscountPercent: 0,
    armoryCostDiscountPercent: 0,
  },
  dungeon: false,
  alliances: { share: 0, size: 5 },
  balance: {},
  seed: 42,
};

function StatCard({
  label,
  value,
  icon,
  color = 'dimmed',
}: {
  label: string;
  value: string;
  icon: any;
  color?: string;
}) {
  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" mb={4}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
          {label}
        </Text>
        <FontAwesomeIcon icon={icon} size="sm" style={{ opacity: 0.5 }} />
      </Group>
      <Text size="xl" fw={900} c={color}>
        {value}
      </Text>
    </Paper>
  );
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return `${Math.round(value)}`;
}

function formatDuration(months: number | null): string {
  if (months === null || !Number.isFinite(months)) return 'n/a';
  if (months >= 24) return `${(months / 12).toFixed(1)}y`;
  return `${months.toFixed(1)}mo`;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  return `${Math.round(seconds / 60)} min`;
}

function formatDays(days: number | null): string {
  return days === null ? 'never' : formatDuration(days / 30.4375);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function BalanceSlider({
  label,
  value,
  min,
  max,
  marks,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  marks: { value: number; label: string }[];
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <Stack gap={4} mb="md">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Text size="sm" fw={700}>
          {format(value)}
        </Text>
      </Group>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={0.01}
        value={value}
        label={format}
        onChange={onChange}
        marks={marks}
      />
    </Stack>
  );
}

function getOffenseUnits(units: UnitCounts): number {
  return units.soldier + units.knight + units.berserker;
}

function getDefenseUnits(units: UnitCounts): number {
  return units.guard + units.archer + units.royalGuard;
}

function getSpyUnits(units: UnitCounts): number {
  return units.spy + units.infiltrator + units.assassin;
}

function getSentryUnits(units: UnitCounts): number {
  return units.sentry + units.sentinel + units.inquisitor;
}

type LiveBalance = Required<SimConfig['balance']>;

function ConfigPanel({
  config,
  liveBalance,
  compare,
  onCompareChange,
  onChange,
  onRun,
  loading,
}: {
  config: SimConfig;
  liveBalance: LiveBalance;
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
  onChange: (c: SimConfig) => void;
  onRun: () => void;
  loading: boolean;
}) {
  const [preset, setPreset] = useState('current');
  const balancePreset = BALANCE_PRESETS[preset] ?? {};

  const applyPreset = (name: string) => {
    setPreset(name);
    const p = BALANCE_PRESETS[name] ?? {};
    onChange({ ...config, balance: { ...p } });
  };
  const setBalance = (patch: Partial<SimConfig['balance']>) => {
    setPreset('custom');
    onChange({ ...config, balance: { ...config.balance, ...patch } });
  };
  // About 3ms per player-day at 30-minute ticks, more when grinders are online every tick.
  const estimatedSeconds =
    ((config.populationSize * config.days * 0.003 * 30) /
      Math.max(5, config.turnIntervalMinutes)) *
    (1 + (config.activityMix.grinder ?? 0) / 50) *
    (compare ? 2 : 1);
  const mixTotal = ACTIVITY_OPTIONS.reduce(
    (sum, option) => sum + (config.activityMix[option.value] ?? 0),
    0,
  );

  return (
    <Stack gap="md">
      <Title order={3}>Population</Title>
      <NumberInput
        label="Players"
        description="Initial active players in the simulation"
        min={2}
        max={500}
        value={config.populationSize}
        onChange={(v) =>
          onChange({ ...config, populationSize: Number(v) || 100 })
        }
      />
      <Grid>
        <Grid.Col span={6}>
          <NumberInput
            label="Min Level"
            min={1}
            max={100}
            value={config.levelRange[0]}
            onChange={(v) =>
              onChange({
                ...config,
                levelRange: [Number(v) || 1, config.levelRange[1]],
              })
            }
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <NumberInput
            label="Max Level"
            min={1}
            max={100}
            value={config.levelRange[1]}
            onChange={(v) =>
              onChange({
                ...config,
                levelRange: [config.levelRange[0], Number(v) || 20],
              })
            }
          />
        </Grid.Col>
      </Grid>

      <Title order={3}>Duration</Title>
      <NumberInput
        label="Days"
        description="How many in-game days to simulate"
        min={1}
        max={365}
        value={config.days}
        onChange={(v) => onChange({ ...config, days: Number(v) || 30 })}
      />
      <NumberInput
        label="Turn Interval (minutes)"
        description="Live game default is 30 minutes per turn tick"
        min={5}
        max={240}
        value={config.turnIntervalMinutes}
        onChange={(v) =>
          onChange({ ...config, turnIntervalMinutes: Number(v) || 30 })
        }
      />
      <NumberInput
        label="Attack Level Range"
        description="Live game attack eligibility by level delta"
        min={0}
        max={100}
        value={config.attackLevelRange}
        onChange={(v) =>
          onChange({ ...config, attackLevelRange: Number(v) || 0 })
        }
      />

      <Divider label="New Player Influx" labelPosition="center" />
      <NumberInput
        label="New Players Every N Days"
        description="0 = no new players join mid-simulation"
        min={0}
        max={120}
        value={config.newPlayerIntervalDays}
        onChange={(v) =>
          onChange({ ...config, newPlayerIntervalDays: Number(v) || 0 })
        }
      />
      {config.newPlayerIntervalDays > 0 && (
        <NumberInput
          label="Players Per Interval"
          min={1}
          max={50}
          value={config.newPlayersPerInterval}
          onChange={(v) =>
            onChange({ ...config, newPlayersPerInterval: Number(v) || 1 })
          }
        />
      )}

      <Divider label="Player Activity" labelPosition="center" />
      <Text size="xs" c="dimmed">
        Share of players by how often they log in. Players only attack, spy,
        recruit and bank while logged in.
      </Text>
      <SimpleGrid cols={2}>
        {ACTIVITY_OPTIONS.map((option) => (
          <NumberInput
            key={option.value}
            label={`${option.label} %`}
            description={option.description}
            min={0}
            max={100}
            value={config.activityMix[option.value]}
            onChange={(v) =>
              onChange({
                ...config,
                activityMix: {
                  ...config.activityMix,
                  [option.value]: typeof v === 'number' ? v : 0,
                },
              })
            }
          />
        ))}
      </SimpleGrid>
      {mixTotal !== 100 && (
        <Text size="xs" c={mixTotal === 0 ? 'red' : 'yellow'}>
          {mixTotal === 0
            ? 'Set at least one share; the default mix will be used.'
            : `Shares add up to ${mixTotal}%; they are scaled to 100%.`}
        </Text>
      )}

      <Divider label="Alliances" labelPosition="center" />
      <Text size="xs" c="dimmed">
        Alliance members never attack each other and share fresh spy reports.
        Lent troops, loans and treasury requests are not modelled.
      </Text>
      <SimpleGrid cols={2}>
        <NumberInput
          label="Players in alliances %"
          min={0}
          max={100}
          value={config.alliances.share}
          onChange={(v) =>
            onChange({
              ...config,
              alliances: {
                ...config.alliances,
                share: typeof v === 'number' ? v : 0,
              },
            })
          }
        />
        <NumberInput
          label="Members per alliance"
          min={2}
          max={50}
          value={config.alliances.size}
          onChange={(v) =>
            onChange({
              ...config,
              alliances: {
                ...config.alliances,
                size: typeof v === 'number' ? v : 5,
              },
            })
          }
        />
      </SimpleGrid>

      <Divider label="Balance Profile" labelPosition="center" />
      <Select
        label="Profile"
        data={[
          { value: 'current', label: 'Live Game' },
          { value: 'equilibrium', label: 'Equilibrium' },
          { value: 'attacker_favored', label: 'Attacker Favored' },
          { value: 'defender_favored', label: 'Defender Favored' },
          { value: 'high_variance', label: 'High Variance' },
          { value: 'custom', label: 'Custom', disabled: true },
        ]}
        value={preset}
        onChange={(v) => v && applyPreset(v)}
      />

      <BalanceSlider
        label="Attacker damage"
        min={0.8}
        max={1.5}
        value={
          config.balance.attackerDamageMultiplier ??
          balancePreset.attackerDamageMultiplier ??
          liveBalance.attackerDamageMultiplier
        }
        format={(v) => `×${v.toFixed(2)}`}
        onChange={(v) => setBalance({ attackerDamageMultiplier: v })}
        marks={[
          { value: 0.8, label: '0.8' },
          { value: 1.0, label: '1.0' },
          { value: 1.5, label: '1.5' },
        ]}
      />
      <BalanceSlider
        label="Defender counter damage"
        min={0.5}
        max={1.2}
        value={
          config.balance.defenderCounterDamageMultiplier ??
          balancePreset.defenderCounterDamageMultiplier ??
          liveBalance.defenderCounterDamageMultiplier
        }
        format={(v) => `×${v.toFixed(2)}`}
        onChange={(v) => setBalance({ defenderCounterDamageMultiplier: v })}
        marks={[
          { value: 0.5, label: '0.5' },
          { value: 1.0, label: '1.0' },
          { value: 1.2, label: '1.2' },
        ]}
      />
      <BalanceSlider
        label="Max pillage per attack"
        min={0.1}
        max={0.6}
        value={
          config.balance.maxPillageSharePerAttack ??
          balancePreset.maxPillageSharePerAttack ??
          liveBalance.maxPillageSharePerAttack
        }
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => setBalance({ maxPillageSharePerAttack: v })}
        marks={[
          { value: 0.1, label: '10%' },
          { value: 0.22, label: '22%' },
          { value: 0.4, label: '40%' },
          { value: 0.6, label: '60%' },
        ]}
      />
      <Divider label="Game Event" labelPosition="center" />
      <Switch
        label="Run a game event"
        description="Applies event effects the way the live events page does"
        checked={config.event.enabled}
        onChange={(event) =>
          onChange({
            ...config,
            event: { ...config.event, enabled: event.currentTarget.checked },
          })
        }
      />
      {config.event.enabled && (
        <SimpleGrid cols={2}>
          {EVENT_FIELDS.map((field) => (
            <NumberInput
              key={field.key}
              label={field.label}
              min={field.min}
              max={field.max}
              step={field.step}
              decimalScale={field.step < 1 ? 1 : 0}
              value={config.event[field.key]}
              onChange={(v) =>
                onChange({
                  ...config,
                  event: {
                    ...config.event,
                    [field.key]: typeof v === 'number' ? v : field.min,
                  },
                })
              }
            />
          ))}
        </SimpleGrid>
      )}

      <Switch
        label="Dungeon on"
        description="Breaching attackers with a level 13+ fort take captives, as when the dungeon is shown in the live game (off by default there)"
        checked={config.dungeon}
        onChange={(event) =>
          onChange({ ...config, dungeon: event.currentTarget.checked })
        }
      />

      <Switch
        label="Compare with the live game"
        description="Also runs the same players and seed on the live balance with no event, and shows the difference"
        checked={compare}
        onChange={(event) => onCompareChange(event.currentTarget.checked)}
      />

      <Divider label="Reproducibility" labelPosition="center" />
      <NumberInput
        label="Seed"
        description="Leave blank for a random seed; results show the seed used"
        min={0}
        value={config.seed ?? ''}
        onChange={(v) =>
          onChange({
            ...config,
            seed: typeof v === 'number' ? v : undefined,
          })
        }
      />

      <Text size="xs" c={estimatedSeconds > 60 ? 'yellow' : 'dimmed'}>
        Estimated run time: about {formatSeconds(estimatedSeconds)}
        {estimatedSeconds > 60 &&
          '. Long runs can time out; try fewer players or days.'}
      </Text>
      <Button
        size="lg"
        leftSection={<FontAwesomeIcon icon={faPlay} />}
        loading={loading}
        onClick={onRun}
        fullWidth
      >
        Run Simulation
      </Button>
    </Stack>
  );
}

function activityLabel(activity: ActivityType | undefined): string {
  return (
    ACTIVITY_OPTIONS.find((option) => option.value === activity)?.label ?? '—'
  );
}

interface ActivityColumn {
  label: string;
  cell: (row: ActivitySummary) => React.ReactNode;
}

/** Two groups of columns, so each table fits the results column without scrolling. */
const ACTIVITY_COLUMN_GROUPS: Array<{
  title: string;
  columns: ActivityColumn[];
}> = [
  {
    title: 'Activity',
    columns: [
      { label: 'Players', cell: (row) => row.players },
      { label: 'Logins', cell: (row) => row.sessionsPerDay.toFixed(1) },
      { label: 'Attacks', cell: (row) => row.attacksPerDay.toFixed(1) },
      { label: 'Won', cell: (row) => formatPercent(row.attackWinRate) },
      { label: 'Held', cell: (row) => formatPercent(row.defenseWinRate) },
      { label: 'Turns', cell: (row) => formatPercent(row.turnsSpentShare) },
    ],
  },
  {
    title: 'Results',
    columns: [
      { label: 'Loot won', cell: (row) => formatCompact(row.lootGainedPerDay) },
      { label: 'Loot lost', cell: (row) => formatCompact(row.lootLostPerDay) },
      { label: 'Armed', cell: (row) => formatPercent(row.armedShare) },
      { label: 'Morale', cell: (row) => row.avgMorale.toFixed(0) },
      {
        label: 'XP (median)',
        cell: (row) => formatCompact(row.medianXpPerDay),
      },
      {
        label: 'L100 median · best',
        cell: (row) =>
          `${formatDays(row.medianDaysToLevel100)} · ${formatDays(row.fastestDaysToLevel100)}`,
      },
    ],
  },
];

function ActivityTable({ rows }: { rows: ActivitySummary[] }) {
  const present = rows.filter((row) => row.players > 0);
  return (
    <Paper withBorder radius="md" p="md">
      <Text size="sm" fw={700}>
        By player type
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        Per player, per day in the run. Won and held are the share of attacks
        won and defenses held; turns is the share of available turns spent;
        armed is the share of offense and defense units with a weapon at the
        end; morale is the average kingdom morale at the end. L100 times project
        today&apos;s XP rate forward, lowered as XP per turn falls at higher
        levels.
      </Text>
      <Stack gap="md">
        {ACTIVITY_COLUMN_GROUPS.map((group) => (
          <AdminDataTable
            key={group.title}
            ariaLabel={`Results by player type: ${group.title.toLowerCase()}`}
            size="compact"
            fz={13}
            horizontalSpacing={8}
            verticalSpacing={6}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{group.title}</Table.Th>
                {group.columns.map((column) => (
                  <Table.Th key={column.label}>{column.label}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {present.map((row) => (
                <Table.Tr key={row.activity}>
                  <Table.Td fw={700}>{activityLabel(row.activity)}</Table.Td>
                  {group.columns.map((column) => (
                    <Table.Td key={column.label}>{column.cell(row)}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </AdminDataTable>
        ))}
      </Stack>
    </Paper>
  );
}

interface ComparisonRow {
  label: string;
  baseline: number | null;
  variant: number | null;
  format: (value: number) => string;
  /** Show the change in percentage points instead of percent. */
  points?: boolean;
}

function formatChange(row: ComparisonRow): string {
  if (row.baseline === null || row.variant === null) return '—';
  if (row.points) {
    const delta = (row.variant - row.baseline) * 100;
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts`;
  }
  if (row.baseline === 0) return row.variant === 0 ? '0%' : 'new';
  const change = ((row.variant - row.baseline) / Math.abs(row.baseline)) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(0)}%`;
}

function ComparisonTable({
  baseline,
  variant,
}: {
  baseline: SimResult;
  variant: SimResult;
}) {
  const rows: ComparisonRow[] = [
    {
      label: 'Attacker win rate',
      baseline: baseline.summary.avgAttackerWinRate,
      variant: variant.summary.avgAttackerWinRate,
      format: formatPercent,
      points: true,
    },
    {
      label: 'Attacks per day',
      baseline: baseline.summary.avgAttacksPerDay,
      variant: variant.summary.avgAttacksPerDay,
      format: (v) => v.toFixed(0),
    },
    {
      label: 'Loot per day',
      baseline: baseline.summary.avgLootPerDay,
      variant: variant.summary.avgLootPerDay,
      format: formatCompact,
    },
    {
      label: 'Fort breaches',
      baseline: baseline.summary.totalFortBreaches,
      variant: variant.summary.totalFortBreaches,
      format: (v) => `${v}`,
    },
  ];
  for (const option of ACTIVITY_OPTIONS) {
    const base = baseline.byActivity.find((r) => r.activity === option.value);
    const next = variant.byActivity.find((r) => r.activity === option.value);
    if (!base?.players || !next?.players) continue;
    rows.push(
      {
        label: `${option.label}: attacks won`,
        baseline: base.attackWinRate,
        variant: next.attackWinRate,
        format: formatPercent,
        points: true,
      },
      {
        label: `${option.label}: XP/day (median)`,
        baseline: base.medianXpPerDay,
        variant: next.medianXpPerDay,
        format: formatCompact,
      },
      {
        label: `${option.label}: L100 (median)`,
        baseline: base.medianDaysToLevel100,
        variant: next.medianDaysToLevel100,
        format: (v) => formatDays(v),
      },
    );
  }
  return (
    <Paper withBorder radius="md" p="md">
      <Text size="sm" fw={700}>
        Change from the live game
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        Same players, activity mix and seed ({variant.config.seed}); only the
        balance and event differ.
      </Text>
      <AdminDataTable
        ariaLabel="Comparison with the live game"
        size="compact"
        fz={13}
        horizontalSpacing={8}
        verticalSpacing={6}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Metric</Table.Th>
            <Table.Th>Live game</Table.Th>
            <Table.Th>This run</Table.Th>
            <Table.Th>Change</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.label}>
              <Table.Td>{row.label}</Table.Td>
              <Table.Td>
                {row.baseline === null ? '—' : row.format(row.baseline)}
              </Table.Td>
              <Table.Td>
                {row.variant === null ? '—' : row.format(row.variant)}
              </Table.Td>
              <Table.Td fw={700}>{formatChange(row)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </AdminDataTable>
    </Paper>
  );
}

function ResultsDashboard({
  result,
  baseline,
}: {
  result: SimResult;
  baseline: SimResult | null;
}) {
  const { t } = useTranslation('admin-game');
  const { summary, charts, topPlayers, config, timing, playerProgress } =
    result;

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }}>
        <StatCard
          label="Run Time"
          value={`${timing.elapsedSeconds.toFixed(1)}s`}
          icon={faChartLine}
          color="blue"
        />
        <StatCard
          label="Attacker Win Rate"
          value={`${(summary.avgAttackerWinRate * 100).toFixed(1)}%`}
          icon={faCrosshairs}
          color={
            summary.avgAttackerWinRate > 0.55
              ? 'yellow'
              : summary.avgAttackerWinRate < 0.4
                ? 'red'
                : 'green'
          }
        />
        <StatCard
          label="Attacks/Day"
          value={summary.avgAttacksPerDay.toFixed(1)}
          icon={faChartLine}
        />
        <StatCard
          label="Fastest XP/Day"
          value={formatCompact(summary.avgXpPerDay)}
          icon={faChartLine}
          color={
            summary.projectedMonthsToLevel100 !== null &&
            summary.projectedMonthsToLevel100 < 30
              ? 'red'
              : summary.projectedMonthsToLevel100 !== null &&
                  summary.projectedMonthsToLevel100 <= 42
                ? 'green'
                : 'yellow'
          }
        />
        <StatCard
          label="Fastest L100 ETA"
          value={formatDuration(summary.projectedMonthsToLevel100)}
          icon={faChartLine}
          color={
            summary.projectedMonthsToLevel100 !== null &&
            summary.projectedMonthsToLevel100 < 30
              ? 'red'
              : summary.projectedMonthsToLevel100 !== null &&
                  summary.projectedMonthsToLevel100 <= 42
                ? 'green'
                : 'yellow'
          }
        />
        <StatCard
          label="Total Loot"
          value={`${(summary.totalLoot / 1000000).toFixed(1)}M`}
          icon={faCoins}
          color="yellow"
        />
        <StatCard
          label="Players"
          value={`${summary.totalPlayers}`}
          icon={faUsers}
          color="blue"
        />
        <StatCard
          label="Breached at End"
          value={`${summary.finalBreachedPlayers}`}
          icon={faSkullCrossbones}
          color={
            summary.finalBreachedPlayers > summary.totalPlayers * 0.3
              ? 'red'
              : 'dimmed'
          }
        />
      </SimpleGrid>

      <Paper withBorder p="xs" radius="md">
        <Text size="xs" c="dimmed" ta="center">
          Effective Balance: ATK×
          {config.effectiveBalance.attackerDamageMultiplier.toFixed(3)} DEF×
          {config.effectiveBalance.defenderCounterDamageMultiplier.toFixed(
            3,
          )}{' '}
          Pillage{' '}
          {(config.effectiveBalance.maxPillageSharePerAttack * 100).toFixed(0)}%{' '}
          | Tick: {config.turnIntervalMinutes}m | Seed: {config.seed} | Max
          Level: {summary.maxLevel} | Avg Held Turns:{' '}
          {summary.avgAttackTurnsHeld.toFixed(1)} | Avg World XP/Turn:{' '}
          {summary.avgXpPerSpentTurn.toFixed(1)} | Pace Player:{' '}
          {summary.pacingPlayerName ?? 'n/a'} | Mercenaries Hired:{' '}
          {summary.mercenariesHired} | Captives Taken: {summary.captivesTaken} |
          Avg {timing.avgMsPerDay.toFixed(0)}ms/day
        </Text>
        <Text size="xs" c="dimmed" ta="center" mt={4}>
          {t('balanceSim.modelLimits')}
        </Text>
      </Paper>

      {baseline && <ComparisonTable baseline={baseline} variant={result} />}

      <ActivityTable rows={result.byActivity} />

      <Tabs defaultValue="winrates">
        <Tabs.List>
          <Tabs.Tab
            value="winrates"
            leftSection={<FontAwesomeIcon icon={faBalanceScale} size="xs" />}
          >
            Win Rates
          </Tabs.Tab>
          <Tabs.Tab
            value="economy"
            leftSection={<FontAwesomeIcon icon={faCoins} size="xs" />}
          >
            Economy
          </Tabs.Tab>
          <Tabs.Tab
            value="population"
            leftSection={<FontAwesomeIcon icon={faUsers} size="xs" />}
          >
            Population
          </Tabs.Tab>
          <Tabs.Tab
            value="combat"
            leftSection={<FontAwesomeIcon icon={faCrosshairs} size="xs" />}
          >
            Combat
          </Tabs.Tab>
          <Tabs.Tab
            value="progress"
            leftSection={<FontAwesomeIcon icon={faUsers} size="xs" />}
          >
            Progress
          </Tabs.Tab>
          <Tabs.Tab
            value="leaderboard"
            leftSection={<FontAwesomeIcon icon={faChartLine} size="xs" />}
          >
            Top Players
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="winrates" pt="md">
          <Text size="sm" c="dimmed" mb="sm">
            Attacker vs Defender win rate per day
          </Text>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={charts.winRates}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={ADMIN_CHART_PALETTE.grid}
              />
              <XAxis
                dataKey="day"
                stroke={ADMIN_CHART_PALETTE.axis}
                fontSize={12}
              />
              <YAxis
                stroke={ADMIN_CHART_PALETTE.axis}
                fontSize={12}
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  ...ADMIN_CHART_TOOLTIP_STYLE,
                  borderRadius: 8,
                }}
                formatter={(v: number) => `${v.toFixed(1)}%`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="attacker"
                stroke={ADMIN_CHART_PALETTE.attacker}
                strokeWidth={2}
                dot={false}
                name="Attacker Win %"
              />
              <Line
                type="monotone"
                dataKey="defender"
                stroke={ADMIN_CHART_PALETTE.defender}
                strokeWidth={2}
                dot={false}
                name="Defender Win %"
              />
            </LineChart>
          </ResponsiveContainer>
        </Tabs.Panel>

        <Tabs.Panel value="economy" pt="md">
          <Text size="sm" c="dimmed" mb="sm">
            Total gold in economy, daily loot transferred, and turn-generated
            income
          </Text>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={charts.economy}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={ADMIN_CHART_PALETTE.grid}
              />
              <XAxis
                dataKey="day"
                stroke={ADMIN_CHART_PALETTE.axis}
                fontSize={12}
              />
              <YAxis stroke={ADMIN_CHART_PALETTE.axis} fontSize={12} />
              <Tooltip
                contentStyle={{
                  ...ADMIN_CHART_TOOLTIP_STYLE,
                  borderRadius: 8,
                }}
                formatter={(v: number) =>
                  v > 1000000
                    ? `${(v / 1000000).toFixed(1)}M`
                    : v > 1000
                      ? `${(v / 1000).toFixed(0)}K`
                      : `${v}`
                }
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="totalGold"
                stroke={ADMIN_CHART_PALETTE.gold}
                fill={ADMIN_CHART_PALETTE.gold}
                fillOpacity={0.15}
                strokeWidth={2}
                name="Total Gold"
              />
              <Area
                type="monotone"
                dataKey="lootPerDay"
                stroke={ADMIN_CHART_PALETTE.loot}
                fill={ADMIN_CHART_PALETTE.loot}
                fillOpacity={0.1}
                strokeWidth={2}
                name="Loot/Day"
              />
              <Line
                type="monotone"
                dataKey="turnIncome"
                stroke={ADMIN_CHART_PALETTE.active}
                strokeWidth={2}
                dot={false}
                name="Turn Income/Day"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Tabs.Panel>

        <Tabs.Panel value="population" pt="md">
          <Text size="sm" c="dimmed" mb="sm">
            Total players, breached forts, and average stored attack turns
          </Text>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={charts.population}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={ADMIN_CHART_PALETTE.grid}
              />
              <XAxis
                dataKey="day"
                stroke={ADMIN_CHART_PALETTE.axis}
                fontSize={12}
              />
              <YAxis stroke={ADMIN_CHART_PALETTE.axis} fontSize={12} />
              <Tooltip
                contentStyle={{
                  ...ADMIN_CHART_TOOLTIP_STYLE,
                  borderRadius: 8,
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="players"
                stroke={ADMIN_CHART_PALETTE.active}
                fill={ADMIN_CHART_PALETTE.active}
                fillOpacity={0.2}
                strokeWidth={2}
                name="Players"
              />
              <Area
                type="monotone"
                dataKey="breached"
                stroke={ADMIN_CHART_PALETTE.defeated}
                fill={ADMIN_CHART_PALETTE.defeated}
                fillOpacity={0.2}
                strokeWidth={2}
                name="Breached Forts"
              />
              <Line
                type="monotone"
                dataKey="avgHeldTurns"
                stroke={ADMIN_CHART_PALETTE.gold}
                strokeWidth={2}
                dot={false}
                name="Avg Held Turns"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Tabs.Panel>

        <Tabs.Panel value="combat" pt="md">
          <Text size="sm" c="dimmed" mb="sm">
            Attack volume and turn economy per day
          </Text>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={charts.attacks}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={ADMIN_CHART_PALETTE.grid}
              />
              <XAxis
                dataKey="day"
                stroke={ADMIN_CHART_PALETTE.axis}
                fontSize={12}
              />
              <YAxis stroke={ADMIN_CHART_PALETTE.axis} fontSize={12} />
              <Tooltip
                contentStyle={{
                  ...ADMIN_CHART_TOOLTIP_STYLE,
                  borderRadius: 8,
                }}
              />
              <Legend />
              <Bar
                dataKey="lowTurn"
                stackId="a"
                fill={ADMIN_CHART_PALETTE.lowTurn}
                name="Low Turn (≤5)"
              />
              <Bar
                dataKey="highTurn"
                stackId="a"
                fill={ADMIN_CHART_PALETTE.highTurn}
                name="High Turn (>5)"
              />
              <Line
                type="monotone"
                dataKey="turnsGenerated"
                stroke={ADMIN_CHART_PALETTE.active}
                strokeWidth={2}
                dot={false}
                name="Turns Generated"
              />
              <Line
                type="monotone"
                dataKey="turnsSpent"
                stroke={ADMIN_CHART_PALETTE.gold}
                strokeWidth={2}
                dot={false}
                name="Turns Spent"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Tabs.Panel>

        <Tabs.Panel value="progress" pt="md">
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <Paper withBorder radius="md" p="md">
                <Text size="sm" fw={700} mb="xs">
                  Slowest Days
                </Text>
                <Stack gap={4}>
                  {timing.slowestDays.slice(0, 6).map((day) => (
                    <Group key={day.day} justify="space-between">
                      <Text size="sm">Day {day.day}</Text>
                      <Text size="sm" c="dimmed">
                        {day.elapsedMs}ms · {day.attacks} attacks
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Paper>

              <Paper withBorder radius="md" p="md">
                <Text size="sm" fw={700} mb="xs">
                  Run Window
                </Text>
                <Text size="sm" c="dimmed">
                  Started {new Date(timing.startedAt).toLocaleTimeString()} ·
                  Finished {new Date(timing.finishedAt).toLocaleTimeString()}
                </Text>
                <Text size="sm" c="dimmed">
                  {timing.elapsedMs.toLocaleString()}ms total across{' '}
                  {summary.totalDays} simulated days
                </Text>
              </Paper>
            </SimpleGrid>

            {playerProgress.map((player, index) => (
              <Paper key={player.id} withBorder radius="md" p="md">
                <Group justify="space-between" mb="sm">
                  <div>
                    <Text fw={800}>
                      #{index + 1} {player.displayName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Started L{player.started.level} · Ended L
                      {player.final.level} · +{player.deltas.level} levels · +
                      {formatCompact(player.deltas.power)} power
                    </Text>
                  </div>
                  <Text fw={800} c="yellow">
                    {formatCompact(player.final.gold + player.final.goldInBank)}
                  </Text>
                </Group>

                <SimpleGrid cols={{ base: 2, sm: 5 }} mb="sm">
                  <Text size="xs" c="dimmed">
                    Gold +{formatCompact(player.deltas.totalGold)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Offense {player.deltas.offenseUnits >= 0 ? '+' : ''}
                    {player.deltas.offenseUnits}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Defense {player.deltas.defenseUnits >= 0 ? '+' : ''}
                    {player.deltas.defenseUnits}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Spy {player.deltas.spyUnits >= 0 ? '+' : ''}
                    {player.deltas.spyUnits}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Workers {player.deltas.workers >= 0 ? '+' : ''}
                    {player.deltas.workers}
                  </Text>
                </SimpleGrid>

                <AdminDataTable
                  ariaLabel={`${player.displayName} checkpoints`}
                  fz={13}
                  horizontalSpacing={8}
                  verticalSpacing={6}
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Day</Table.Th>
                      <Table.Th>Level</Table.Th>
                      <Table.Th>Gold</Table.Th>
                      <Table.Th>Power</Table.Th>
                      <Table.Th>Army</Table.Th>
                      <Table.Th>Spy/Sentry</Table.Th>
                      <Table.Th>Fort</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {player.checkpoints.map((point) => (
                      <Table.Tr key={`${player.id}-${point.day}`}>
                        <Table.Td>{point.day}</Table.Td>
                        <Table.Td>{point.level}</Table.Td>
                        <Table.Td>
                          {formatCompact(point.gold + point.goldInBank)}
                        </Table.Td>
                        <Table.Td>{formatCompact(point.power)}</Table.Td>
                        <Table.Td>
                          {getOffenseUnits(point.units)}/
                          {getDefenseUnits(point.units)}
                        </Table.Td>
                        <Table.Td>
                          {getSpyUnits(point.units)}/
                          {getSentryUnits(point.units)}
                        </Table.Td>
                        <Table.Td>
                          {Math.round(point.fortHp)}/{point.fortMaxHp}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </AdminDataTable>
              </Paper>
            ))}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="leaderboard" pt="md">
          <Text size="sm" c="dimmed" mb="sm">
            {t('balanceSim.leaderboardCaption')}
          </Text>
          <AdminDataTable
            ariaLabel={t('balanceSim.leaderboardCaption')}
            fz={14}
            horizontalSpacing={12}
            verticalSpacing={6}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>{t('balanceSim.name')}</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>{t('balanceSim.level')}</Table.Th>
                <Table.Th>{t('balanceSim.gold')}</Table.Th>
                <Table.Th>{t('balanceSim.power')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {topPlayers.map((p, i) => (
                <Table.Tr key={p.id}>
                  <Table.Td c="dimmed">{i + 1}</Table.Td>
                  <Table.Td>{p.displayName}</Table.Td>
                  <Table.Td>{activityLabel(p.activity)}</Table.Td>
                  <Table.Td fw={700} c={ADMIN_CHART_PALETTE.attacker}>
                    {p.level}
                  </Table.Td>
                  <Table.Td c={ADMIN_CHART_PALETTE.gold}>
                    {p.gold > 1000000
                      ? `${(p.gold / 1000000).toFixed(1)}M`
                      : p.gold > 1000
                        ? `${(p.gold / 1000).toFixed(0)}K`
                        : p.gold}
                  </Table.Td>
                  <Table.Td>{Math.round(p.power)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </AdminDataTable>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

const BalanceSimPage = ({ liveBalance }: { liveBalance: LiveBalance }) => {
  const { t } = useTranslation('admin-game');
  const [config, setConfig] = useState<SimConfig>(defaultConfig);
  const [result, setResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(false);

  const [compare, setCompare] = useState(false);
  const [baseline, setBaseline] = useState<SimResult | null>(null);

  const runSimulation = useCallback(async () => {
    const post = async (body: SimConfig): Promise<SimResult> => {
      const response = await fetch('/api/admin/simulation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || t('balanceSim.runFailed'));
      }
      return response.json();
    };

    setLoading(true);
    setResult(null);
    setBaseline(null);
    try {
      const variant = await post(config);
      // The baseline reuses the variant's seed, so only the balance differs.
      const base = compare
        ? await post({
            ...config,
            balance: {},
            event: { ...config.event, enabled: false },
            seed: variant.config.seed,
          })
        : null;
      setResult(variant);
      setBaseline(base);
    } catch (error) {
      alertService.notify(
        'error',
        error instanceof Error ? error.message : t('balanceSim.runFailed'),
        { title: t('balanceSim.errorTitle') },
      );
    } finally {
      setLoading(false);
    }
  }, [compare, config, t]);

  return (
    <AdminLayout
      administratorOnly
      title={t('balanceTitle')}
      permissions={[PermissionType.MANAGE_EVENTS]}
    >
      <Grid>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <GameCard title={t('balanceSim.configuration')} icon={faBalanceScale}>
            <ConfigPanel
              config={config}
              liveBalance={liveBalance}
              compare={compare}
              onCompareChange={setCompare}
              onChange={setConfig}
              onRun={runSimulation}
              loading={loading}
            />
          </GameCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 8 }}>
          {result ? (
            <ResultsDashboard result={result} baseline={baseline} />
          ) : (
            <Paper p="xl" radius="md" withBorder ta="center">
              <Stack align="center" gap="md">
                <FontAwesomeIcon
                  icon={faBalanceScale}
                  size="3x"
                  style={{ opacity: 0.3 }}
                />
                <Text c="dimmed" size="lg">
                  {t('balanceSim.emptyTitle')}
                </Text>
                <Text c="dimmed" size="sm">
                  {t('balanceSim.emptyDescription')}
                </Text>
              </Stack>
            </Paper>
          )}
        </Grid.Col>
      </Grid>
    </AdminLayout>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const [session, translations] = await Promise.all([
    getServerSession(context.req, context.res, authOptions),
    serverSideTranslations(context.locale ?? 'en', [
      'common',
      'home',
      'navigation',
      'admin-game',
    ]),
  ]);
  const userId = Number(session?.user?.id);
  const authorized =
    Number.isSafeInteger(userId) &&
    userId > 0 &&
    !isImpersonatedSession(session) &&
    (await isAdmin(userId).catch(() => false));
  if (!authorized) {
    return { redirect: { destination: '/account/login', permanent: false } };
  }
  const live = getDefaultBattleConstants();
  const liveBalance: LiveBalance = {
    attackerDamageMultiplier: live.ATTACKER_DAMAGE_MULTIPLIER,
    defenderCounterDamageMultiplier: live.DEFENDER_COUNTER_DAMAGE_MULTIPLIER,
    maxPillageSharePerAttack: live.MAX_PILLAGE_SHARE_PER_ATTACK,
    damageVarianceMin: live.DAMAGE_VARIANCE_MIN,
    damageVarianceMax: live.DAMAGE_VARIANCE_MAX,
  };
  return { props: { ...translations, liveBalance } };
};

export default BalanceSimPage;
