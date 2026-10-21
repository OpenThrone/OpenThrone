import { faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Avatar,
  Badge,
  Box,
  Button,
  Group,
  Indicator,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

import { AdminDataTable } from '@/components/admin/AdminDataTable';
import TablePagination from '@/components/admin/TablePagination';
import type { AllianceListHit } from '@/components/alliance/AllianceListBadge';
import { AllianceListBadge } from '@/components/alliance/AllianceListBadge';
import AttackLogTable from '@/components/AttackLog';
import BankHistoryTable from '@/components/BankHistoryTable';
import actionClasses from '@/components/battle/PlayerActions.module.css';
import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import type { UpgradeLedgerRow } from '@/components/game/UpgradeLedger';
import { UpgradeLedger } from '@/components/game/UpgradeLedger';
import LossesList from '@/components/LossesList';
import PlayerOutcome from '@/components/PlayerOutcome';
import profileActionClasses from '@/components/ProfileActions.module.css';
import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import StatsList from '@/components/StatsList';
import StatsTable from '@/components/statsTable';
import type { Log, Loss, PlayerRace } from '@/types/typings';
import { toLocale } from '@/utils/numberFormatting';
import { getAvatarSrc } from '@/utils/utilities';

import { mockAction, MockClicks, ShowcaseSection, Specimen } from '../Showcase';

/* ------------------------------------------------------------------ */
/* Attack target list (/battle/users)                                  */
/* ------------------------------------------------------------------ */

interface MockTarget {
  id: number;
  overallrank: number;
  displayName: string;
  race: Exclude<PlayerRace, 'ALL'>;
  playerClass: string;
  alliance: string;
  gold: number;
  population: number;
  level: number;
  isOnline: boolean;
  isProtected?: boolean;
  isYou?: boolean;
  lists?: AllianceListHit[];
}

const LOG_ACTIONS = ['Attack Again', 'Attack Back', 'View Battle'];
const RACE_LABELS: Record<MockTarget['race'], string> = {
  HUMAN: 'Human',
  ELF: 'Elf',
  GOBLIN: 'Goblin',
  UNDEAD: 'Undead',
};

const MOCK_TARGETS: MockTarget[] = [
  {
    id: 101,
    overallrank: 1,
    displayName: 'Morgrath the Unbowed',
    race: 'UNDEAD',
    playerClass: 'Fighter',
    alliance: 'Ashen Court',
    gold: 48_210_550,
    population: 12_840,
    level: 42,
    isOnline: true,
    lists: [{ allianceId: 7, allianceName: 'Silver Vigil', lists: ['HIT'] }],
  },
  {
    id: 102,
    overallrank: 2,
    displayName: 'Elowen Starbough',
    race: 'ELF',
    playerClass: 'Cleric',
    alliance: 'Silver Vigil',
    gold: 21_004_900,
    population: 10_115,
    level: 39,
    isOnline: false,
    isYou: true,
  },
  {
    id: 103,
    overallrank: 3,
    displayName: 'Grizzleknuck of the Mire',
    race: 'GOBLIN',
    playerClass: 'Thief',
    alliance: '-',
    gold: 9_870_120,
    population: 8_402,
    level: 37,
    isOnline: true,
    lists: [{ allianceId: 7, allianceName: 'Silver Vigil', lists: ['FARM'] }],
  },
  {
    id: 104,
    overallrank: 4,
    displayName: 'Ser Aldric Vane',
    race: 'HUMAN',
    playerClass: 'Assassin',
    alliance: 'Crown of Dawn',
    gold: 1_250_000,
    population: 2_310,
    level: 12,
    isOnline: false,
    isProtected: true,
    lists: [{ allianceId: 7, allianceName: 'Silver Vigil', lists: ['BLOCK'] }],
  },
];

const withAlpha = (hex: string, alpha: string) =>
  hex.startsWith('#') && hex.length === 7 ? `${hex}${alpha}` : hex;

/**
 * Mirrors the row markup of /battle/users. The page's `PlayerActions` reads
 * the live runtime config (an API poll), so the Attack/Spy buttons are
 * re-created here with the same classes and mock actions.
 */
function AttackTargetList() {
  const { t } = useTranslation('battle');
  const theme = useMantineTheme();
  const brand = theme.colors.brand ?? theme.colors.blue;
  const secondary = theme.colors.secondary ?? theme.colors.yellow;
  const accent = secondary[4] ?? '#e5c55a';
  const rowGlow = brand[6] ?? '#1d4ed8';
  const headers = [
    t('users.rank', 'Rank'),
    t('users.username'),
    t('users.alliance'),
    t('users.gold'),
    t('users.population'),
    t('users.level'),
    t('actions.title'),
  ];

  return (
    <GameCard title="Attack targets" className={actionClasses.tableCard}>
      <StyledTable
        regionTestId="table-container"
        ariaLabel={headers.join(', ')}
        tableProps={{
          highlightOnHover: true,
          className: `text-left ${actionClasses.ledger}`,
        }}
        headers={headers.map((label, index) => (
          <Table.Th
            key={label}
            className={
              index === headers.length - 1
                ? actionClasses.actionsCell
                : index === 0
                  ? 'p-1'
                  : 'px-4 py-2'
            }
            w={index === 0 ? 100 : undefined}
          >
            {label}
          </Table.Th>
        ))}
      >
        {MOCK_TARGETS.map((player) => (
          <Table.Tr
            key={player.id}
            className={actionClasses.playerRow}
            style={{
              background: player.isYou
                ? `linear-gradient(90deg, ${withAlpha(rowGlow, '40')} 0%, transparent 100%)`
                : undefined,
              transition: 'background 0.2s ease',
            }}
          >
            <Table.Td
              className={`p-2 ${actionClasses.rankCell}`}
              style={{ borderColor: 'var(--ot-line)' }}
            >
              <Text fw={700} c="dimmed" size="sm">
                #{player.overallrank}
              </Text>
            </Table.Td>
            <Table.Td className={`px-4 py-2 ${actionClasses.nameCell}`}>
              <Group gap="sm" wrap="nowrap" className={actionClasses.identity}>
                <Indicator
                  className={actionClasses.identityAvatar}
                  color={player.isOnline ? 'teal' : 'red'}
                >
                  <Box
                    style={{
                      border: '1px solid var(--ot-line)',
                      padding: '1px',
                      background: 'var(--ot-inset)',
                    }}
                  >
                    <Avatar
                      src={getAvatarSrc('SHIELD', player.race)}
                      size={34}
                      radius={0}
                    />
                  </Box>
                </Indicator>
                <div className={actionClasses.identityText}>
                  <Text
                    fz="med"
                    fw={500}
                    component="div"
                    className={actionClasses.nameLine}
                  >
                    <Tooltip
                      label={player.displayName}
                      position="top-start"
                      withinPortal
                      events={{ hover: true, focus: true, touch: false }}
                    >
                      <Link
                        href={`/userprofile/${player.id}`}
                        onClick={(event) => {
                          event.preventDefault();
                          mockAction(`open profile of ${player.displayName}`)();
                        }}
                        className={`${actionClasses.displayName} font-bold text-blue-500 hover:text-blue-700`}
                      >
                        {player.displayName}
                      </Link>
                    </Tooltip>
                    {player.isProtected && (
                      <Tooltip label={t('users.protectedHint')} withArrow>
                        <Badge
                          size="sm"
                          variant="light"
                          color="teal"
                          className={actionClasses.identityBadge}
                          leftSection={
                            <FontAwesomeIcon icon={faShieldHalved} />
                          }
                        >
                          {t('users.protected')}
                        </Badge>
                      </Tooltip>
                    )}
                    {player.lists && (
                      <AllianceListBadge
                        alliances={player.lists}
                        variant="compact"
                      />
                    )}
                    {player.isYou && (
                      <Badge
                        color="green"
                        className={actionClasses.identityBadge}
                      >
                        {t('users.you')}
                      </Badge>
                    )}
                  </Text>
                  <Text
                    fz="xs"
                    c="dimmed"
                    className={actionClasses.identitySubline}
                  >
                    {RACE_LABELS[player.race]} {player.playerClass}
                  </Text>
                </div>
              </Group>
            </Table.Td>
            <Table.Td
              className={`px-4 py-2 ${actionClasses.allianceCell}`}
              style={{
                borderColor: 'var(--ot-line)',
                color: 'var(--ot-heading)',
              }}
            >
              <Text component="span" className={actionClasses.mobileLabel}>
                {t('users.alliance')}
              </Text>
              {player.alliance}
            </Table.Td>
            <Table.Td
              className={`px-4 py-2 ${actionClasses.statCell}`}
              style={{ borderColor: 'var(--ot-line)' }}
            >
              <Text className={actionClasses.mobileLabel}>
                {t('users.gold')}
              </Text>
              <Text style={{ color: accent }} fw={600} size="sm">
                {toLocale(player.gold)}
              </Text>
            </Table.Td>
            <Table.Td
              className={`px-4 py-2 ${actionClasses.statCell}`}
              style={{ borderColor: 'var(--ot-line)' }}
            >
              <Text c="white" fw={700} size="sm">
                <span className={actionClasses.mobileLabel}>
                  {t('users.population')}
                </span>
                {toLocale(player.population)}
              </Text>
            </Table.Td>
            <Table.Td
              className={`px-4 py-2 ${actionClasses.statCell}`}
              style={{ borderColor: 'var(--ot-line)' }}
            >
              <Text c="white" fw={700} size="sm">
                <span className={actionClasses.mobileLabel}>
                  {t('users.level')}
                </span>
                {player.level}
              </Text>
            </Table.Td>
            <Table.Td className={actionClasses.actionsCell}>
              {!player.isYou && (
                <Group gap={6} wrap="nowrap" className={actionClasses.actions}>
                  {(
                    [
                      {
                        action: 'attack',
                        icon: 'crossed-swords',
                        tone: 'danger',
                      },
                      { action: 'spy', icon: 'hood', tone: 'arcane' },
                    ] as const
                  ).map(({ action, icon, tone }) => (
                    <Tooltip
                      key={action}
                      label={t(`actions.${action}`)}
                      events={{ hover: true, focus: true, touch: false }}
                    >
                      <Button
                        size="compact-xs"
                        styles={{ inner: { gap: 0 } }}
                        className={`${profileActionClasses.action} ${actionClasses.button}`}
                        data-tone={tone}
                        aria-label={t(`actions.${action}Target`, {
                          name: player.displayName,
                        })}
                        leftSection={<RpgAwesomeIcon icon={icon} aria-hidden />}
                        onClick={mockAction(`${action} ${player.displayName}`)}
                      >
                        {t(`actions.${action}`)}
                      </Button>
                    </Tooltip>
                  ))}
                </Group>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </StyledTable>
    </GameCard>
  );
}

/* ------------------------------------------------------------------ */
/* Community stats, losses and battle logs                             */
/* ------------------------------------------------------------------ */

const MOCK_STATS = [
  { id: 101, display_name: 'Morgrath the Unbowed', stat: 1_204_550_000 },
  { id: 102, display_name: 'Elowen Starbough', stat: 980_120_400 },
  { id: 103, display_name: 'Grizzleknuck of the Mire', stat: 455_870_000 },
  { id: 104, display_name: 'Ser Aldric Vane', stat: 120_004_210 },
  { id: 105, display_name: 'Vashka Nightroot', stat: 98_400_000 },
];

const unit = (
  type: string,
  level: number,
  quantity: number,
): Loss['units'][number] => ({
  id: 0,
  userId: 0,
  type,
  level,
  quantity,
  isMercenary: false,
});

const HEAVY_LOSSES: Loss = {
  total: 412,
  units: [
    unit('OFFENSE', 1, 220),
    unit('OFFENSE', 2, 140),
    unit('OFFENSE', 1, 32),
    unit('CITIZEN', 1, 20),
  ],
};

const LIGHT_LOSSES: Loss = {
  total: 58,
  units: [unit('DEFENSE', 1, 40), unit('DEFENSE', 3, 18)],
};

const BREACHED_LOSSES: Loss = {
  total: 196,
  units: [
    unit('DEFENSE', 1, 120),
    unit('CITIZEN', 1, 44),
    unit('WORKER', 1, 20),
    unit('OFFENSE', 1, 12),
  ],
};

const PLAYERS = {
  you: { id: 102, display_name: 'Elowen Starbough', race: 'ELF' },
  morgrath: { id: 101, display_name: 'Morgrath the Unbowed', race: 'UNDEAD' },
  grizzle: {
    id: 103,
    display_name: 'Grizzleknuck of the Mire',
    race: 'GOBLIN',
  },
  aldric: { id: 104, display_name: 'Ser Aldric Vane', race: 'HUMAN' },
};

/** Logs where the viewer (Elowen, id 102) attacked. */
const OFFENSE_LOGS: Log[] = [
  {
    id: 9001,
    winner: PLAYERS.you.id,
    attacker_id: PLAYERS.you.id,
    defender_id: PLAYERS.grizzle.id,
    attackerPlayer: PLAYERS.you,
    defenderPlayer: PLAYERS.grizzle,
    timestamp: '2026-10-19T21:14:00.000Z',
    type: 'attack',
    stats: {
      pillagedGold: 1_482_300,
      xpEarned: { attacker: 1_240, defender: 310 },
      turns: 8,
      attacker_losses: LIGHT_LOSSES,
      defender_losses: HEAVY_LOSSES,
      forthpAtStart: 1_200,
      forthpAtEnd: 640,
    },
  },
  {
    id: 9002,
    winner: PLAYERS.morgrath.id,
    attacker_id: PLAYERS.you.id,
    defender_id: PLAYERS.morgrath.id,
    attackerPlayer: PLAYERS.you,
    defenderPlayer: PLAYERS.morgrath,
    timestamp: '2026-10-18T07:42:00.000Z',
    type: 'attack',
    stats: {
      pillagedGold: 0,
      xpEarned: { attacker: 180, defender: 920 },
      turns: 4,
      attacker_losses: HEAVY_LOSSES,
      defender_losses: LIGHT_LOSSES,
      forthpAtStart: 3_000,
      forthpAtEnd: 2_960,
    },
  },
];

/** Logs where the viewer (Elowen, id 102) defended. */
const DEFENSE_LOGS: Log[] = [
  {
    id: 9003,
    winner: PLAYERS.you.id,
    attacker_id: PLAYERS.aldric.id,
    defender_id: PLAYERS.you.id,
    attackerPlayer: PLAYERS.aldric,
    defenderPlayer: PLAYERS.you,
    timestamp: '2026-10-17T13:05:00.000Z',
    type: 'attack',
    stats: {
      pillagedGold: 0,
      xpEarned: { attacker: 90, defender: 640 },
      attacker_losses: HEAVY_LOSSES,
      defender_losses: LIGHT_LOSSES,
      forthpAtStart: 1_500,
      forthpAtEnd: 1_420,
    },
  },
  {
    id: 9004,
    winner: PLAYERS.morgrath.id,
    attacker_id: PLAYERS.morgrath.id,
    defender_id: PLAYERS.you.id,
    attackerPlayer: PLAYERS.morgrath,
    defenderPlayer: PLAYERS.you,
    timestamp: '2026-10-16T02:30:00.000Z',
    type: 'attack',
    stats: {
      pillagedGold: 3_904_000,
      xpEarned: { attacker: 1_610, defender: 120 },
      attacker_losses: LIGHT_LOSSES,
      defender_losses: BREACHED_LOSSES,
      forthpAtStart: 900,
      forthpAtEnd: 0,
      fort_breached: true,
      defense_advisory: {
        fortBreached: true,
        civilianLosses: 64,
        offensiveLosses: 12,
      },
    },
  },
];

/* ------------------------------------------------------------------ */
/* Bank history (/structures/bank/history)                             */
/* ------------------------------------------------------------------ */

const BANK_USER = { id: 102 };
const BANK_PAGE_SIZE = 5;

/** Shaped like the rows the bank history API returns. */
const MOCK_BANK_HISTORY = [
  {
    history_type: 'PLAYER_TRANSFER',
    from_user_id: 102,
    to_user_id: 102,
    from_user_account_type: 'HAND',
    to_user_account_type: 'BANK',
    gold_amount: '2500000',
  },
  {
    history_type: 'ECONOMY',
    from_user_id: 0,
    to_user_id: 102,
    from_user_account_type: 'BANK',
    to_user_account_type: 'HAND',
    gold_amount: '184200',
  },
  {
    history_type: 'SALE',
    from_user_id: 102,
    to_user_id: 0,
    from_user_account_type: 'HAND',
    to_user_account_type: 'BANK',
    gold_amount: '750000',
    stats: { type: 'ARMORY_EQUIP' },
  },
  {
    history_type: 'SALE',
    from_user_id: 102,
    to_user_id: 0,
    from_user_account_type: 'HAND',
    to_user_account_type: 'BANK',
    gold_amount: '420000',
    stats: { type: 'TRAINING_TRAIN' },
  },
  {
    history_type: 'WAR_SPOILS',
    from_user_id: 103,
    to_user_id: 102,
    from_user_account_type: 'HAND',
    to_user_account_type: 'HAND',
    gold_amount: '1482300',
  },
  {
    history_type: 'DAILY_RECRUIT',
    from_user_id: 0,
    to_user_id: 102,
    from_user_account_type: 'BANK',
    to_user_account_type: 'HAND',
    gold_amount: '0',
    stats: { newCitizens: 1_250, currentCitizens: 1_200 },
  },
  {
    history_type: 'PLAYER_TRANSFER',
    from_user_id: 102,
    to_user_id: 102,
    from_user_account_type: 'BANK',
    to_user_account_type: 'HAND',
    gold_amount: '1000000',
  },
  {
    history_type: 'RECRUITMENT',
    from_user_id: 0,
    to_user_id: 102,
    from_user_account_type: 'BANK',
    to_user_account_type: 'HAND',
    gold_amount: '5000',
  },
  {
    history_type: 'FORT_REPAIR',
    from_user_id: 102,
    to_user_id: 0,
    from_user_account_type: 'HAND',
    to_user_account_type: 'BANK',
    gold_amount: '96000',
  },
  {
    history_type: 'PLAYER_TRANSFER',
    from_user_id: 102,
    to_user_id: 104,
    from_user_account_type: 'HAND',
    to_user_account_type: 'HAND',
    gold_amount: '250000',
  },
  {
    history_type: 'SALE',
    from_user_id: 0,
    to_user_id: 102,
    from_user_account_type: 'BANK',
    to_user_account_type: 'HAND',
    gold_amount: '310000',
    stats: { type: 'BATTLE_UPGRADES_SELL' },
  },
  {
    history_type: 'ECONOMY',
    from_user_id: 0,
    to_user_id: 102,
    from_user_account_type: 'BANK',
    to_user_account_type: 'HAND',
    gold_amount: '184200',
  },
].map((entry, index) => ({
  ...entry,
  date_time: new Date(Date.UTC(2026, 9, 19, 22 - index * 2, 15)).toISOString(),
}));

function BankHistoryDemo() {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(MOCK_BANK_HISTORY.length / BANK_PAGE_SIZE);
  return (
    <BankHistoryTable
      bankHistory={MOCK_BANK_HISTORY.slice(
        page * BANK_PAGE_SIZE,
        (page + 1) * BANK_PAGE_SIZE,
      )}
      user={BANK_USER}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Admin data tables (/home/admin/*)                                   */
/* ------------------------------------------------------------------ */

const MOCK_AUDIT_ROWS = [
  { id: 5012, actor: 'Warden Ysolde', action: 'BAN_USER', target: '#103' },
  { id: 5011, actor: 'System', action: 'ERA_RESET', target: 'Era 7' },
  { id: 5010, actor: 'Warden Ysolde', action: 'GOLD_GRANT', target: '#102' },
  { id: 5009, actor: 'Archivist Brann', action: 'POST_PIN', target: 'News' },
  { id: 5008, actor: 'Archivist Brann', action: 'POST_EDIT', target: 'News' },
  { id: 5007, actor: 'System', action: 'BOT_SPAWN', target: '12 bots' },
].map((row, index) => ({
  ...row,
  at: new Date(Date.UTC(2026, 9, 19, 20 - index * 3, 5)).toLocaleString(),
}));

function AdminTableDemo() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const rows = MOCK_AUDIT_ROWS.slice((page - 1) * pageSize, page * pageSize);
  return (
    <Stack gap="sm">
      <AdminDataTable ariaLabel="Audit log" size="default">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Actor</Table.Th>
            <Table.Th>Action</Table.Th>
            <Table.Th>Target</Table.Th>
            <Table.Th>Time</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td>#{row.id}</Table.Td>
              <Table.Td>{row.actor}</Table.Td>
              <Table.Td>
                <Badge size="sm" variant="light">
                  {row.action}
                </Badge>
              </Table.Td>
              <Table.Td>{row.target}</Table.Td>
              <Table.Td>{row.at}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </AdminDataTable>
      <TablePagination
        label="Audit log pages"
        page={page}
        pageSize={pageSize}
        total={MOCK_AUDIT_ROWS.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/* Upgrade ledger (/structures/upgrades/[tab])                         */
/* ------------------------------------------------------------------ */

/** Siege-style rows: level 3 owned, 4 buyable, 5 waits on 4, 6 fort-locked. */
const MOCK_UPGRADE_ROWS: UpgradeLedgerRow[] = [
  { level: 3, name: 'Battering Ram', fort: 3, bonus: 15, cost: 400_000 },
  { level: 4, name: 'Siege Tower', fort: 4, bonus: 20, cost: 1_200_000 },
  { level: 5, name: 'Trebuchet', fort: 5, bonus: 25, cost: 3_600_000 },
  { level: 6, name: 'Bombard', fort: 7, bonus: 30, cost: 9_000_000 },
].map((row) => ({
  key: String(row.level),
  name: row.name,
  position: row.level,
  purchaseIndex: row.level - 1,
  cells: [`Fort ${row.fort}`, `Offense bonus: ${row.bonus}%`],
  cost: row.cost,
  requirement: { type: 'fort' as const, value: row.fort, met: row.fort <= 5 },
}));

function UpgradeLedgerDemo() {
  return (
    <UpgradeLedger
      columns={['Fort Req.', 'Bonus']}
      rows={MOCK_UPGRADE_ROWS}
      ownedPosition={3}
      onBuy={(index) =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            mockAction(`buy upgrade index ${index}`)();
            resolve();
          }, 800);
        })
      }
    />
  );
}

/* ------------------------------------------------------------------ */

export default function TablesSection() {
  return (
    <ShowcaseSection
      id="tables"
      title="Tables & lists"
      description="Ledgers and lists fed with mock players, battles and bank rows. Sorting, paging and row expansion are local; actions only raise a mock notice."
    >
      <Specimen
        framed={false}
        name="Attack target list (StyledTable + AllianceListBadge)"
        usedOn={['/battle/users']}
        note="Row markup mirrors the page. PlayerActions polls /api/config, so the Attack and Spy buttons are copies that share its classes and fire mock actions."
        wide
      >
        <AttackTargetList />
      </Specimen>

      <Specimen
        framed={false}
        name="StatsTable"
        usedOn={['/community/stats']}
        wide
      >
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          <StatsTable
            title="Top 5 gold on hand"
            description="Gold carried by each warlord at the moment of the snapshot."
            data={MOCK_STATS}
          />
          <StatsTable
            title="Most active recruiters"
            data={MOCK_STATS.slice(0, 3).map((row, index) => ({
              ...row,
              stat: 412 - index * 97,
            }))}
            displayButton={false}
          />
        </SimpleGrid>
      </Specimen>

      <Specimen
        name="LossesList"
        usedOn={['/battle/history', '/battle/results/[id]']}
      >
        <Group align="flex-start" gap="xl">
          <Stack gap={4} align="center">
            <Text size="xs" c="dimmed" tt="uppercase">
              With breakdown
            </Text>
            <LossesList losses={HEAVY_LOSSES} />
          </Stack>
          <Stack gap={4} align="center">
            <Text size="xs" c="dimmed" tt="uppercase">
              Redacted (total only)
            </Text>
            <LossesList losses={HEAVY_LOSSES} showUnits={false} />
          </Stack>
          <Stack gap={4} align="center">
            <Text size="xs" c="dimmed" tt="uppercase">
              Legacy JSON string
            </Text>
            <LossesList losses={JSON.stringify(LIGHT_LOSSES)} />
          </Stack>
        </Group>
      </Specimen>

      <Specimen name="StatsList" usedOn={['/battle/history']}>
        <Group align="flex-start" gap="xl">
          <StatsList
            stats={OFFENSE_LOGS[0].stats}
            type="attack"
            subType="attack"
            collapsed
          />
          <StatsList
            stats={OFFENSE_LOGS[0].stats}
            type="attack"
            subType="attack"
            collapsed={false}
          />
        </Group>
      </Specimen>

      <Specimen
        name="PlayerOutcome"
        usedOn={['/battle/history']}
        note="Renders two table cells; shown inside a bare table row."
      >
        <Table>
          <Table.Tbody>
            <Table.Tr>
              <PlayerOutcome log={OFFENSE_LOGS[0]} type="attack" />
            </Table.Tr>
            <Table.Tr>
              <PlayerOutcome
                log={DEFENSE_LOGS[1]}
                type="defense"
                collapsed={false}
              />
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Specimen>

      <Specimen
        name="UpgradeLedger"
        usedOn={['/structures/upgrades/[tab]']}
        note="Shared by all six upgrade tabs. Owned badge on the current level, Buy only on the next level (pending while the mock request runs), a waiting row that needs the previous upgrade and a fort-locked row. Cost is always grouped gold."
        wide
      >
        <UpgradeLedgerDemo />
      </Specimen>

      <Specimen
        name="BankHistoryTable"
        usedOn={['/structures/bank/history']}
        note="Twelve mock rows paged five at a time locally."
        wide
      >
        <BankHistoryDemo />
      </Specimen>

      <Specimen
        framed={false}
        name="AttackLogTable (attacker view)"
        usedOn={['/battle/history']}
        note="StyledTable inside the page's GameCard: labelled, keyboard-scrollable region with theme header cells. One win, one loss. Expand a row for unit losses. Attack again and View battle are mock actions here."
        wide
      >
        <GameCard title="Attack log">
          <MockClicks labels={LOG_ACTIONS}>
            <AttackLogTable logs={OFFENSE_LOGS} type="attack" viewerID={102} />
          </MockClicks>
        </GameCard>
      </Specimen>

      <Specimen
        framed={false}
        name="AttackLogTable (defender view)"
        usedOn={['/battle/history']}
        note="One held defense, one breach. Expand the breach to see the DefenseAdvisory row."
        wide
      >
        <GameCard title="Defense log">
          <MockClicks labels={LOG_ACTIONS}>
            <AttackLogTable logs={DEFENSE_LOGS} type="defense" viewerID={102} />
          </MockClicks>
        </GameCard>
      </Specimen>

      <Specimen
        name="AdminDataTable + TablePagination"
        usedOn={[
          '/home/admin/attacks',
          '/home/admin/audit-logs',
          '/home/admin/analytics',
          '/home/admin/cheat-signals',
        ]}
        note="Admin and moderation lists. One min-width rule by column count (compact 480, default 720, wide 1000), zebra rows and one accent hover. Paging is local here."
        wide
      >
        <AdminTableDemo />
      </Specimen>
    </ShowcaseSection>
  );
}
