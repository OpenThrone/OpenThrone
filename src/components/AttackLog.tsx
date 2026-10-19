import {
  faEye,
  faMinus,
  faPlus,
  faRedo,
  faSort,
  faSortDown,
  faSortUp,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Box,
  Paper,
  rem,
  Stack,
  Table,
  Text,
  UnstyledButton,
} from '@mantine/core';
import router from 'next/router';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo, useState } from 'react';

import { DefenseAdvisory } from '@/components/DefenseAdvisory';
import type { Log } from '@/types/typings';
import { getDefenseAdvisory } from '@/utils/defenseAdvisory';

import AnimatedButtons from './AnimatedButton';
import LossesList from './LossesList';
import Modal from './modal';
import PlayerOutcome from './PlayerOutcome';
import StatsList from './StatsList';

/** Loss totals arrive as objects (redacted logs) or JSON strings (legacy rows). */
const lossTotal = (losses: unknown): number => {
  try {
    const parsed = typeof losses === 'string' ? JSON.parse(losses) : losses;
    return Number((parsed as { total?: unknown } | null)?.total) || 0;
  } catch {
    return 0;
  }
};

const EMPTY_LOSSES = { total: 0, units: [] };

interface AttackLogTableProps {
  logs: Log[];
  type: string;
  viewerID?: number;
}

type SortDirection = 'asc' | 'desc' | null;
type SortableColumn = 'outcome' | 'player' | 'pillage' | 'casualties' | null;

const thBaseStyle: React.CSSProperties = {
  color: 'var(--ot-heading)',
  borderBottom: '1px solid #2f3e52',
  textTransform: 'uppercase',
  fontSize: '11px',
  letterSpacing: '1px',
  paddingTop: rem(12),
  paddingBottom: rem(12),
};

const thStyleSortable: React.CSSProperties = {
  ...thBaseStyle,
  cursor: 'pointer',
};

const thStyleStatic: React.CSSProperties = {
  ...thBaseStyle,
  cursor: 'default',
};

const getSortIcon = (
  column: SortableColumn,
  currentSort: SortableColumn,
  currentDirection: SortDirection,
) => {
  if (currentSort !== column) return faSort;
  return currentDirection === 'asc' ? faSortUp : faSortDown;
};

interface SortableHeaderProps {
  column: SortableColumn | null;
  label: string;
  onSort: (column: SortableColumn) => void;
  currentSort: SortableColumn;
  currentDirection: SortDirection;
}

const SortableHeader: React.FC<SortableHeaderProps> = ({
  column,
  label,
  onSort,
  currentSort,
  currentDirection,
}) => {
  return (
    <Table.Th
      style={column ? thStyleSortable : thStyleStatic}
      data-testid={column ? 'sort-header' : undefined}
      onClick={() => column && onSort(column)}
    >
      <div className="flex items-center justify-center">
        {label}
        {column && (
          <FontAwesomeIcon
            icon={getSortIcon(column, currentSort, currentDirection)}
            size="sm"
            className="ml-1 opacity-70"
            data-testid="sort-indicator"
          />
        )}
      </div>
    </Table.Th>
  );
};

const MemoizedSortableHeader = React.memo(SortableHeader);

const AttackLogTable: React.FC<AttackLogTableProps> = ({
  logs,
  type,
  viewerID,
}) => {
  const { t } = useTranslation('battle');
  const [openModalId, setOpenModalId] = useState<string | null>(null);
  const [collapsedLogs, setCollapsedLogs] = useState<Record<string, boolean>>(
    {},
  );

  const [sortColumn, setSortColumn] = useState<SortableColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const toggleCollapse = useCallback((logId: string) => {
    setCollapsedLogs((prev) => ({
      ...prev,
      [logId]: !(prev[logId] ?? true),
    }));
  }, []);

  const toggleModal = useCallback((id: string) => {
    setOpenModalId((prevId) => (prevId === id ? null : id));
  }, []);

  const handleSort = useCallback(
    (column: SortableColumn) => {
      if (sortColumn === column) {
        if (sortDirection === 'asc') setSortDirection('desc');
        else if (sortDirection === 'desc') {
          setSortDirection(null);
          setSortColumn(null);
        } else setSortDirection('asc');
      } else {
        setSortColumn(column);
        setSortDirection('asc');
      }
    },
    [sortColumn, sortDirection],
  );

  const sortedLogs = useMemo(() => {
    if (!sortColumn || !sortDirection) return logs;

    return [...logs].sort((a, b) => {
      switch (sortColumn) {
        case 'outcome': {
          const aWon =
            a.winner === (type === 'defense' ? a.defender_id : a.attacker_id);
          const bWon =
            b.winner === (type === 'defense' ? b.defender_id : b.attacker_id);
          return sortDirection === 'asc'
            ? Number(aWon) - Number(bWon)
            : Number(bWon) - Number(aWon);
        }
        case 'player': {
          const aName =
            type === 'defense'
              ? a.attackerPlayer?.display_name || ''
              : a.defenderPlayer?.display_name || '';
          const bName =
            type === 'defense'
              ? b.attackerPlayer?.display_name || ''
              : b.defenderPlayer?.display_name || '';
          return sortDirection === 'asc'
            ? aName.localeCompare(bName)
            : bName.localeCompare(aName);
        }
        case 'pillage':
          return sortDirection === 'asc'
            ? Number(a.stats.pillagedGold || 0) -
                Number(b.stats.pillagedGold || 0)
            : Number(b.stats.pillagedGold || 0) -
                Number(a.stats.pillagedGold || 0);
        case 'casualties': {
          const aCasualties = lossTotal(
            type === 'attack'
              ? a.stats.attacker_losses
              : a.stats.defender_losses,
          );
          const bCasualties = lossTotal(
            type === 'attack'
              ? b.stats.attacker_losses
              : b.stats.defender_losses,
          );
          return sortDirection === 'asc'
            ? aCasualties - bCasualties
            : bCasualties - aCasualties;
        }
        default:
          return 0;
      }
    });
  }, [logs, sortColumn, sortDirection, type]);

  return (
    <Paper
      radius="sm"
      style={{
        backgroundColor: '#131b29',
        border: '1px solid #2f3e52',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}
    >
      <Box style={{ overflowX: 'auto' }} data-testid="table-wrapper">
        <Table verticalSpacing="sm" data-testid="styled-table">
          <Table.Thead style={{ background: '#0e1520' }}>
            <Table.Tr data-testid="table-row">
              <MemoizedSortableHeader
                column={null}
                label=""
                onSort={handleSort}
                currentSort={sortColumn}
                currentDirection={sortDirection}
              />
              <MemoizedSortableHeader
                column="outcome"
                label={t('warHistory.outcome')}
                onSort={handleSort}
                currentSort={sortColumn}
                currentDirection={sortDirection}
              />
              <MemoizedSortableHeader
                column="player"
                label={t('warHistory.player')}
                onSort={handleSort}
                currentSort={sortColumn}
                currentDirection={sortDirection}
              />
              <MemoizedSortableHeader
                column="pillage"
                label={t('warHistory.pillageAndExp')}
                onSort={handleSort}
                currentSort={sortColumn}
                currentDirection={sortDirection}
              />
              <MemoizedSortableHeader
                column="casualties"
                label={t('warHistory.casualties')}
                onSort={handleSort}
                currentSort={sortColumn}
                currentDirection={sortDirection}
              />
              <MemoizedSortableHeader
                column={null}
                label={t('warHistory.action')}
                onSort={handleSort}
                currentSort={sortColumn}
                currentDirection={sortDirection}
              />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {logs.length === 0 ? (
              <Table.Tr data-testid="table-row">
                <Table.Td
                  colSpan={6}
                  className="text-center"
                  style={{ borderColor: 'var(--ot-line)' }}
                >
                  {t('warHistory.noBattles')}
                </Table.Td>
              </Table.Tr>
            ) : (
              sortedLogs.map((log) => {
                const profileId =
                  type === 'defense' ? log.attacker_id : log.defender_id;
                const modalLabel =
                  type === 'defense'
                    ? t('battleReport.attackBack')
                    : t('battleReport.attackAgain');
                const yourLosses =
                  type === 'defense'
                    ? log.stats.defender_losses
                    : log.stats.attacker_losses;
                const enemyLosses =
                  type === 'defense'
                    ? log.stats.attacker_losses
                    : log.stats.defender_losses;

                const isViewerDefender =
                  type === 'defense' &&
                  log.type === 'attack' &&
                  viewerID === log.defender_id;
                const showDefenseAdvisory =
                  !(collapsedLogs[log.id] ?? true) &&
                  getDefenseAdvisory(log.stats, isViewerDefender) !== null;

                return (
                  <React.Fragment key={log.id}>
                    <Table.Tr data-testid="table-row">
                      <Table.Td
                        style={{ borderColor: 'var(--ot-line)', width: '20px' }}
                      >
                        <UnstyledButton
                          onClick={() => toggleCollapse(log.id.toString())}
                          aria-expanded={!(collapsedLogs[log.id] ?? true)}
                          aria-label={
                            (collapsedLogs[log.id] ?? true)
                              ? t('warHistory.showDetails')
                              : t('warHistory.hideDetails')
                          }
                          className="focus:outline-none"
                        >
                          <FontAwesomeIcon
                            icon={
                              (collapsedLogs[log.id] ?? true) ? faPlus : faMinus
                            }
                            size="sm"
                          />
                        </UnstyledButton>
                      </Table.Td>
                      <PlayerOutcome
                        log={log}
                        type={type}
                        collapsed={collapsedLogs[log.id] ?? true}
                      />
                      <Table.Td style={{ borderColor: 'var(--ot-line)' }}>
                        <StatsList
                          stats={log.stats}
                          type={type}
                          subType={log.type}
                          collapsed={collapsedLogs[log.id] ?? true}
                        />
                      </Table.Td>
                      <Table.Td style={{ borderColor: 'var(--ot-line)' }}>
                        <Stack align="center" justify="center" gap="sm">
                          <Stack gap={2} align="center">
                            <Text size="xs" c="dimmed" tt="uppercase">
                              {t('warHistory.yourLosses')}
                            </Text>
                            <LossesList
                              losses={yourLosses ?? EMPTY_LOSSES}
                              showUnits={!(collapsedLogs[log.id] ?? true)}
                            />
                          </Stack>
                          <Stack gap={2} align="center">
                            <Text size="xs" c="dimmed" tt="uppercase">
                              {t('warHistory.enemyLosses')}
                            </Text>
                            <LossesList losses={enemyLosses ?? EMPTY_LOSSES} />
                          </Stack>
                          {!(collapsedLogs[log.id] ?? true) && (
                            <Stack gap={2} align="center">
                              <Text size="xs" c="dimmed" tt="uppercase">
                                {t('warHistory.fortDamage')}
                              </Text>
                              <span>
                                {log.stats.fortDamage ??
                                  (log.stats.forthpAtStart || 0) -
                                    (log.stats.forthpAtEnd || 0)}
                              </span>
                            </Stack>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td
                        style={{
                          borderColor: 'var(--ot-line)',
                          textAlign: 'center',
                        }}
                      >
                        <AnimatedButtons
                          buttons={[
                            {
                              icon: faRedo,
                              label: modalLabel,
                              onClick: () => toggleModal(profileId.toString()),
                              color: 'blue',
                              tooltip: modalLabel,
                              ariaLabel: modalLabel,
                            },
                            {
                              icon: faEye,
                              label: t('warHistory.viewBattle'),
                              onClick: () =>
                                router.push(`/battle/results/${log.id}`),
                              color: 'teal',
                              tooltip: t('warHistory.viewBattleDetails'),
                              ariaLabel: t('warHistory.viewBattle'),
                            },
                          ]}
                          orientation="vertical"
                          spacing="xs"
                        />
                        <Modal
                          isOpen={openModalId === profileId.toString()}
                          toggleModal={() => toggleModal(profileId.toString())}
                          profileID={profileId}
                          targetName={
                            type === 'defense'
                              ? log.attackerPlayer?.display_name
                              : log.defenderPlayer?.display_name
                          }
                        />
                      </Table.Td>
                    </Table.Tr>
                    {showDefenseAdvisory && (
                      <Table.Tr>
                        <Table.Td
                          colSpan={6}
                          style={{ borderColor: 'var(--ot-line)' }}
                        >
                          <DefenseAdvisory
                            stats={log.stats}
                            isViewerDefender={isViewerDefender}
                          />
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      </Box>
    </Paper>
  );
};

export default React.memo(AttackLogTable);
