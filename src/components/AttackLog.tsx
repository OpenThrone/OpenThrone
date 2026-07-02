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
import { Box, Chip, Paper, rem, Stack, Table } from '@mantine/core';
import router from 'next/router';
import React, { useCallback, useMemo, useState } from 'react';

import type { Log } from '@/types/typings';

import AnimatedButtons from './AnimatedButton';
import LossesList from './LossesList';
import Modal from './modal';
import PlayerOutcome from './PlayerOutcome';
import StatsList from './StatsList';

interface AttackLogTableProps {
  logs: Log[];
  type: string;
}

type SortDirection = 'asc' | 'desc' | null;
type SortableColumn = 'outcome' | 'player' | 'pillage' | 'casualties' | null;

const thBaseStyle: React.CSSProperties = {
  color: '#687b94',
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

const AttackLogTable: React.FC<AttackLogTableProps> = ({ logs, type }) => {
  const [openModalId, setOpenModalId] = useState<string | null>(null);
  const [collapsedLogs, setCollapsedLogs] = useState<Record<string, boolean>>(
    {},
  );

  const [sortColumn, setSortColumn] = useState<SortableColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const toggleCollapse = useCallback((logId: string) => {
    setCollapsedLogs((prev) => ({ ...prev, [logId]: !prev[logId] }));
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
            a.winner === (type === 'offense' ? a.attacker_id : a.defender_id);
          const bWon =
            b.winner === (type === 'offense' ? b.attacker_id : b.defender_id);
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
            ? (a.stats.pillagedGold || 0) - (b.stats.pillagedGold || 0)
            : (b.stats.pillagedGold || 0) - (a.stats.pillagedGold || 0);
        case 'casualties': {
          const aCasualties =
            type === 'offense'
              ? JSON.parse(a.stats.attacker_losses)?.total || 0
              : JSON.parse(a.stats.defender_losses)?.total || 0;
          const bCasualties =
            type === 'offense'
              ? JSON.parse(b.stats.attacker_losses)?.total || 0
              : JSON.parse(b.stats.defender_losses)?.total || 0;
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
                label="Outcome"
                onSort={handleSort}
                currentSort={sortColumn}
                currentDirection={sortDirection}
              />
              <MemoizedSortableHeader
                column="player"
                label="Player"
                onSort={handleSort}
                currentSort={sortColumn}
                currentDirection={sortDirection}
              />
              <MemoizedSortableHeader
                column="pillage"
                label="Pillage & Exp"
                onSort={handleSort}
                currentSort={sortColumn}
                currentDirection={sortDirection}
              />
              <MemoizedSortableHeader
                column="casualties"
                label="Casualties"
                onSort={handleSort}
                currentSort={sortColumn}
                currentDirection={sortDirection}
              />
              <MemoizedSortableHeader
                column={null}
                label="Action"
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
                  style={{ borderColor: '#1f2b3b' }}
                >
                  No battles recorded
                </Table.Td>
              </Table.Tr>
            ) : (
              sortedLogs.map((log) => {
                const profileId =
                  type === 'defense' ? log.attacker_id : log.defender_id;
                const modalLabel =
                  type === 'defense' ? 'Attack Back' : 'Attack Again';

                return (
                  <Table.Tr key={log.id} data-testid="table-row">
                    <Table.Td style={{ borderColor: '#1f2b3b', width: '20px' }}>
                      <button
                        onClick={() => toggleCollapse(log.id.toString())}
                        aria-expanded={!(collapsedLogs[log.id] ?? true)}
                        className="focus:outline-none"
                      >
                        <FontAwesomeIcon
                          icon={collapsedLogs[log.id] ?? true ? faPlus : faMinus}
                          size="sm"
                        />
                      </button>
                    </Table.Td>
                    <PlayerOutcome
                      log={log}
                      type={type}
                      collapsed={collapsedLogs[log.id] ?? true}
                    />
                    <Table.Td style={{ borderColor: '#1f2b3b' }}>
                      <StatsList
                        stats={log.stats}
                        type={type}
                        subType={log.type}
                        collapsed={collapsedLogs[log.id] ?? true}
                      />
                    </Table.Td>
                    <Table.Td style={{ borderColor: '#1f2b3b' }}>
                      {collapsedLogs[log.id] ?? true ? (
                        '...'
                      ) : (
                        <Stack align="center" justify="center" gap="xs">
                          <Chip>
                            Attacker Losses:{' '}
                            <LossesList
                              losses={
                                log.stats.attacker_losses || {
                                  total: 0,
                                  units: [],
                                }
                              }
                            />
                          </Chip>
                          <Chip>
                            Defender Losses:{' '}
                            <LossesList
                              losses={
                                log.stats.defender_losses || {
                                  total: 0,
                                  units: [],
                                }
                              }
                            />
                          </Chip>
                          <Chip>
                            Fort Damage:{' '}
                            {(log.stats.forthpAtStart || 0) -
                              (log.stats.forthpAtEnd || 0)}
                          </Chip>
                        </Stack>
                      )}
                    </Table.Td>
                    <Table.Td
                      style={{ borderColor: '#1f2b3b', textAlign: 'center' }}
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
                            label: 'View Battle',
                            onClick: () =>
                              router.push(`/battle/results/${log.id}`),
                            color: 'teal',
                            tooltip: 'View battle details',
                            ariaLabel: 'View Battle',
                          },
                        ]}
                        orientation="vertical"
                        spacing="xs"
                      />
                      <Modal
                        isOpen={openModalId === profileId.toString()}
                        toggleModal={() => toggleModal(profileId.toString())}
                        profileID={profileId}
                      />
                    </Table.Td>
                  </Table.Tr>
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
