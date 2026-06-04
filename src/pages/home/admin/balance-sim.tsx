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
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PermissionType } from '@prisma/client';
import React, { useCallback, useState } from 'react';
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

import AdminLayout from '@/components/admin/AdminLayout';
import { GameCard } from '@/components/game/GameCard';

interface SimConfig {
  populationSize: number;
  levelRange: [number, number];
  days: number;
  turnIntervalMinutes: number;
  newPlayerIntervalDays: number;
  newPlayersPerInterval: number;
  attackLevelRange: number;
  balance: {
    attackerDamageMultiplier?: number;
    defenderCounterDamageMultiplier?: number;
    maxPillageSharePerAttack?: number;
    damageVarianceMin?: number;
    damageVarianceMax?: number;
  };
  seed?: number;
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
  };
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

const CHART_COLORS = {
  attacker: '#f59e0b',
  defender: '#6366f1',
  gold: '#eab308',
  loot: '#22c55e',
  active: '#3b82f6',
  defeated: '#ef4444',
  lowTurn: '#f97316',
  highTurn: '#8b5cf6',
};

const defaultConfig: SimConfig = {
  populationSize: 100,
  levelRange: [5, 20],
  days: 30,
  turnIntervalMinutes: 30,
  newPlayerIntervalDays: 0,
  newPlayersPerInterval: 0,
  attackLevelRange: 5,
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

function ConfigPanel({
  config,
  onChange,
  onRun,
  loading,
}: {
  config: SimConfig;
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

  return (
    <Stack gap="md">
      <Title order={4}>Population</Title>
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

      <Title order={4}>Duration</Title>
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

      <Divider label="Balance Profile" labelPosition="center" />
      <Select
        label="Profile"
        data={[
          { value: 'current', label: 'Current Production' },
          { value: 'equilibrium', label: 'Equilibrium (50/50)' },
          { value: 'attacker_favored', label: 'Attacker Favored' },
          { value: 'defender_favored', label: 'Defender Favored' },
          { value: 'high_variance', label: 'High Variance' },
        ]}
        value={preset}
        onChange={(v) => v && applyPreset(v)}
      />

      <Slider
        label="Attacker DMG Mult"
        min={0.8}
        max={1.5}
        step={0.01}
        value={
          config.balance.attackerDamageMultiplier ??
          balancePreset.attackerDamageMultiplier ??
          1.238
        }
        onChange={(v) =>
          onChange({
            ...config,
            balance: { ...config.balance, attackerDamageMultiplier: v },
          })
        }
        marks={[
          { value: 0.8, label: '0.8' },
          { value: 1.0, label: '1.0' },
          { value: 1.238, label: '1.24' },
          { value: 1.5, label: '1.5' },
        ]}
      />
      <Slider
        label="Defender Counter Mult"
        min={0.5}
        max={1.2}
        step={0.01}
        value={
          config.balance.defenderCounterDamageMultiplier ??
          balancePreset.defenderCounterDamageMultiplier ??
          0.83
        }
        onChange={(v) =>
          onChange({
            ...config,
            balance: {
              ...config.balance,
              defenderCounterDamageMultiplier: v,
            },
          })
        }
        marks={[
          { value: 0.5, label: '0.5' },
          { value: 0.83, label: '0.83' },
          { value: 1.0, label: '1.0' },
          { value: 1.2, label: '1.2' },
        ]}
      />
      <Slider
        label="Max Pillage Share"
        min={0.1}
        max={0.6}
        step={0.01}
        value={
          config.balance.maxPillageSharePerAttack ??
          balancePreset.maxPillageSharePerAttack ??
          0.22
        }
        onChange={(v) =>
          onChange({
            ...config,
            balance: { ...config.balance, maxPillageSharePerAttack: v },
          })
        }
        marks={[
          { value: 0.1, label: '10%' },
          { value: 0.22, label: '22%' },
          { value: 0.4, label: '40%' },
          { value: 0.6, label: '60%' },
        ]}
      />

      <Divider label="Reproducibility" labelPosition="center" />
      <NumberInput
        label="Seed"
        description="Fixed seed for reproducible results"
        min={0}
        value={config.seed ?? 0}
        onChange={(v) =>
          onChange({
            ...config,
            seed: Number(v) || undefined,
          })
        }
      />

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

function ResultsDashboard({ result }: { result: SimResult }) {
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
          label="Pace XP/Day"
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
          label="L100 Pace"
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
          label="Breached Forts"
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
          | Tick: {config.turnIntervalMinutes}m | Max Level: {summary.maxLevel}{' '}
          | Avg Held Turns: {summary.avgAttackTurnsHeld.toFixed(1)} | Avg World
          XP/Turn: {summary.avgXpPerSpentTurn.toFixed(1)} | Pace Player:{' '}
          {summary.pacingPlayerName ?? 'n/a'} | Avg{' '}
          {timing.avgMsPerDay.toFixed(0)}ms/day
        </Text>
      </Paper>

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
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="day" stroke="#888" fontSize={12} />
              <YAxis
                stroke="#888"
                fontSize={12}
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid #333',
                  borderRadius: 8,
                }}
                formatter={(v: number) => `${v.toFixed(1)}%`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="attacker"
                stroke={CHART_COLORS.attacker}
                strokeWidth={2}
                dot={false}
                name="Attacker Win %"
              />
              <Line
                type="monotone"
                dataKey="defender"
                stroke={CHART_COLORS.defender}
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
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="day" stroke="#888" fontSize={12} />
              <YAxis stroke="#888" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid #333',
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
                stroke={CHART_COLORS.gold}
                fill={CHART_COLORS.gold}
                fillOpacity={0.15}
                strokeWidth={2}
                name="Total Gold"
              />
              <Area
                type="monotone"
                dataKey="lootPerDay"
                stroke={CHART_COLORS.loot}
                fill={CHART_COLORS.loot}
                fillOpacity={0.1}
                strokeWidth={2}
                name="Loot/Day"
              />
              <Line
                type="monotone"
                dataKey="turnIncome"
                stroke={CHART_COLORS.active}
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
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="day" stroke="#888" fontSize={12} />
              <YAxis stroke="#888" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid #333',
                  borderRadius: 8,
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="players"
                stroke={CHART_COLORS.active}
                fill={CHART_COLORS.active}
                fillOpacity={0.2}
                strokeWidth={2}
                name="Players"
              />
              <Area
                type="monotone"
                dataKey="breached"
                stroke={CHART_COLORS.defeated}
                fill={CHART_COLORS.defeated}
                fillOpacity={0.2}
                strokeWidth={2}
                name="Breached Forts"
              />
              <Line
                type="monotone"
                dataKey="avgHeldTurns"
                stroke={CHART_COLORS.gold}
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
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="day" stroke="#888" fontSize={12} />
              <YAxis stroke="#888" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid #333',
                  borderRadius: 8,
                }}
              />
              <Legend />
              <Bar
                dataKey="lowTurn"
                stackId="a"
                fill={CHART_COLORS.lowTurn}
                name="Low Turn (≤5)"
              />
              <Bar
                dataKey="highTurn"
                stackId="a"
                fill={CHART_COLORS.highTurn}
                name="High Turn (>5)"
              />
              <Line
                type="monotone"
                dataKey="turnsGenerated"
                stroke={CHART_COLORS.active}
                strokeWidth={2}
                dot={false}
                name="Turns Generated"
              />
              <Line
                type="monotone"
                dataKey="turnsSpent"
                stroke={CHART_COLORS.gold}
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

                <Paper withBorder radius="sm" style={{ overflow: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr style={{ textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px' }}>Day</th>
                        <th style={{ padding: '6px 8px' }}>Level</th>
                        <th style={{ padding: '6px 8px' }}>Gold</th>
                        <th style={{ padding: '6px 8px' }}>Power</th>
                        <th style={{ padding: '6px 8px' }}>Army</th>
                        <th style={{ padding: '6px 8px' }}>Spy/Sentry</th>
                        <th style={{ padding: '6px 8px' }}>Fort</th>
                      </tr>
                    </thead>
                    <tbody>
                      {player.checkpoints.map((point) => (
                        <tr
                          key={`${player.id}-${point.day}`}
                          style={{
                            borderTop: '1px solid var(--mantine-color-dark-4)',
                          }}
                        >
                          <td style={{ padding: '6px 8px' }}>{point.day}</td>
                          <td style={{ padding: '6px 8px' }}>{point.level}</td>
                          <td style={{ padding: '6px 8px' }}>
                            {formatCompact(point.gold + point.goldInBank)}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            {formatCompact(point.power)}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            {getOffenseUnits(point.units)}/
                            {getDefenseUnits(point.units)}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            {getSpyUnits(point.units)}/
                            {getSentryUnits(point.units)}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            {Math.round(point.fortHp)}/{point.fortMaxHp}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Paper>
              </Paper>
            ))}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="leaderboard" pt="md">
          <Text size="sm" c="dimmed" mb="sm">
            Top 10 players by level and power at simulation end
          </Text>
          <Paper withBorder radius="md" style={{ overflow: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 14,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: 'var(--mantine-color-dark-6)',
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: '8px 12px' }}>#</th>
                  <th style={{ padding: '8px 12px' }}>Name</th>
                  <th style={{ padding: '8px 12px' }}>Level</th>
                  <th style={{ padding: '8px 12px' }}>Gold</th>
                  <th style={{ padding: '8px 12px' }}>Power</th>
                </tr>
              </thead>
              <tbody>
                {topPlayers.map((p, i) => (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid var(--mantine-color-dark-4)',
                    }}
                  >
                    <td style={{ padding: '6px 12px', color: '#888' }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '6px 12px' }}>{p.displayName}</td>
                    <td
                      style={{
                        padding: '6px 12px',
                        fontWeight: 700,
                        color: CHART_COLORS.attacker,
                      }}
                    >
                      {p.level}
                    </td>
                    <td
                      style={{
                        padding: '6px 12px',
                        color: CHART_COLORS.gold,
                      }}
                    >
                      {p.gold > 1000000
                        ? `${(p.gold / 1000000).toFixed(1)}M`
                        : p.gold > 1000
                          ? `${(p.gold / 1000).toFixed(0)}K`
                          : p.gold}
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      {Math.round(p.power)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

const BalanceSimPage = () => {
  const [config, setConfig] = useState<SimConfig>(defaultConfig);
  const [result, setResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/admin/simulation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Simulation failed');
      }
      const data = await response.json();
      setResult(data);
    } catch (error) {
      notifications.show({
        title: 'Simulation Error',
        message:
          error instanceof Error ? error.message : 'Failed to run simulation',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, [config]);

  return (
    <AdminLayout
      title="Balance Simulator"
      permissions={[
        PermissionType.MANAGE_EVENTS,
        PermissionType.VIEW_STAFF_DASHBOARD,
      ]}
    >
      <Grid>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <GameCard title="Configuration" icon={faBalanceScale}>
            <ConfigPanel
              config={config}
              onChange={setConfig}
              onRun={runSimulation}
              loading={loading}
            />
          </GameCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 8 }}>
          {result ? (
            <ResultsDashboard result={result} />
          ) : (
            <Paper p="xl" radius="md" withBorder ta="center">
              <Stack align="center" gap="md">
                <FontAwesomeIcon
                  icon={faBalanceScale}
                  size="3x"
                  style={{ opacity: 0.3 }}
                />
                <Text c="dimmed" size="lg">
                  Configure parameters and run a simulation to see balance
                  metrics.
                </Text>
                <Text c="dimmed" size="sm">
                  The simulation will generate an AI-driven population that
                  attacks, spies, and grows economy over the configured
                  duration.
                </Text>
              </Stack>
            </Paper>
          )}
        </Grid.Col>
      </Grid>
    </AdminLayout>
  );
};

export default BalanceSimPage;
