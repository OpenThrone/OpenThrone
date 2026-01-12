import { faPlus, faMinus, faSort, faSortUp, faSortDown, faEye, faRedo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Stack, Chip, Paper, Table, rem, Box } from "@mantine/core";
import router from "next/router";
import { useState, useMemo } from "react";
import LossesList from "./LossesList";
import PlayerOutcome from "./PlayerOutcome";
import StatsList from "./StatsList";
import { Log } from "@/types/typings";
import AnimatedButtons from "./AnimatedButton";
import Modal from "../components/modal";

interface AttackLogTableProps {
  logs: Log[];
  type: string;
}

type SortDirection = 'asc' | 'desc' | null;
type SortableColumn = 'outcome' | 'player' | 'pillage' | 'casualties' | null;

const AttackLogTable: React.FC<AttackLogTableProps> = ({ logs, type }) => {
  const isEmpty = logs.length === 0;

  const [openModalId, setOpenModalId] = useState<string | null>(null);
  const [collapsedLogs, setCollapsedLogs] = useState<Record<string, boolean>>({});
  
  const [sortColumn, setSortColumn] = useState<SortableColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const toggleCollapse = (logId: string) => {
    setCollapsedLogs((prev) => ({ ...prev, [logId]: !prev[logId] }));
  };

  const toggleModal = (id: string) => {
    setOpenModalId((prevId) => (prevId === id ? null : id));
  };

  const handleSort = (column: SortableColumn) => {
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
  };

  const getSortIcon = (column: SortableColumn) => {
    if (sortColumn !== column) return faSort;
    return sortDirection === 'asc' ? faSortUp : faSortDown;
  };

  const sortedLogs = useMemo(() => {
    if (!sortColumn || !sortDirection) return logs;
    
    return [...logs].sort((a, b) => {
      let compareResult = 0;
      
      switch(sortColumn) {
        case 'outcome':
          const aWon = a.winner === (type === 'offense' ? a.attacker_id : a.defender_id);
          const bWon = b.winner === (type === 'offense' ? b.attacker_id : b.defender_id);
          compareResult = Number(aWon) - Number(bWon);
          break;
        case 'player':
          const aName = type === 'defense' ? (a.attackerPlayer?.display_name || '') : (a.defenderPlayer?.display_name || '');
          const bName = type === 'defense' ? (b.attackerPlayer?.display_name || '') : (b.defenderPlayer?.display_name || '');
          compareResult = aName.localeCompare(bName);
          break;
        case 'pillage':
          compareResult = (a.stats.pillagedGold || 0) - (b.stats.pillagedGold || 0);
          break;
        case 'casualties':
          const aCasualties = (type === 'offense' ? (JSON.parse(a.stats.attacker_losses)?.total || 0) : (JSON.parse(a.stats.defender_losses)?.total || 0));
          const bCasualties = (type === 'offense' ? (JSON.parse(b.stats.attacker_losses)?.total || 0) : (JSON.parse(b.stats.defender_losses)?.total || 0));
          compareResult = aCasualties - bCasualties;
          break;
      }
      
      return sortDirection === 'asc' ? compareResult : -compareResult;
    });
  }, [logs, sortColumn, sortDirection, type]);

  const SortableHeader = ({ column, label }: { column: SortableColumn | null, label: string }) => {
    const thStyle = {
      color: '#687b94',
      borderBottom: '1px solid #2f3e52',
      textTransform: 'uppercase' as const,
      fontSize: '11px',
      letterSpacing: '1px',
      paddingTop: rem(12),
      paddingBottom: rem(12),
      cursor: column ? 'pointer' : 'default',
    };

    return (
      <Table.Th
        style={thStyle}
        data-testid={column ? 'sort-header' : undefined}
        onClick={() => column && handleSort(column)}
      >
        <div className="flex items-center justify-center">
          {label}
          {column && (
            <FontAwesomeIcon
              icon={getSortIcon(column)}
              size="sm"
              className="ml-1 opacity-70"
              data-testid="sort-indicator"
            />
          )}
        </div>
      </Table.Th>
    );
  };

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
            <SortableHeader column={null} label="" />
            <SortableHeader column="outcome" label="Outcome" />
            <SortableHeader column="player" label="Player" />
            <SortableHeader column="pillage" label="Pillage & Exp" />
            <SortableHeader column="casualties" label="Casualties" />
            <SortableHeader column={null} label="Action" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isEmpty ? (
              <Table.Tr data-testid="table-row">
                <Table.Td colSpan={6} className="text-center" style={{ borderColor: '#1f2b3b' }}>
                  No battles recorded
                </Table.Td>
              </Table.Tr>
            ) : (
              sortedLogs.map((log) => {
                const isCollapsed = collapsedLogs[log.id] ?? true;
                const profileId = type === 'defense' ? log.attacker_id : log.defender_id;
                const modalLabel = type === 'defense' ? 'Attack Back' : 'Attack Again';

                return (
                  <Table.Tr key={log.id} data-testid="table-row">
                  <Table.Td style={{ borderColor: '#1f2b3b', width: '20px' }}>
                    <button onClick={() => toggleCollapse(log.id.toString())} aria-expanded={!isCollapsed} className="focus:outline-none">
                      <FontAwesomeIcon icon={isCollapsed ? faPlus : faMinus} size="sm" />
                    </button>
                  </Table.Td>
                  <PlayerOutcome log={log} type={type} collapsed={isCollapsed} />
                  <Table.Td style={{ borderColor: '#1f2b3b' }}>
                    <StatsList stats={log.stats} type={type} subType={log.type} collapsed={isCollapsed} />
                  </Table.Td>
                  <Table.Td style={{ borderColor: '#1f2b3b' }}>
                    {isCollapsed ? (
                      '...'
                    ) : (
                      <Stack align="center" justify="center" gap="xs">
                        <Chip>
                          Attacker Losses: <LossesList losses={log.stats.attacker_losses || { total: 0, units: [] }} />
                        </Chip>
                        <Chip>
                          Defender Losses: <LossesList losses={log.stats.defender_losses || { total: 0, units: [] }} />
                        </Chip>
                        <Chip>
                          Fort Damage: {(log.stats.forthpAtStart || 0) - (log.stats.forthpAtEnd || 0)}
                        </Chip>
                      </Stack>
                    )}
                  </Table.Td>
                  <Table.Td style={{ borderColor: '#1f2b3b', textAlign: 'center' }}>
                    <AnimatedButtons
                      buttons={[
                        {
                          icon: faRedo,
                          label: modalLabel,
                          onClick: () => toggleModal(profileId.toString()),
                          color: "blue",
                          tooltip: modalLabel,
                          ariaLabel: modalLabel,
                        },
                        {
                          icon: faEye,
                          label: "View Battle",
                          onClick: () => router.push(`/battle/results/${log.id}`),
                          color: "teal",
                          tooltip: "View battle details",
                          ariaLabel: "View Battle",
                        },
                      ]}
                      orientation="vertical"
                      spacing="xs"
                    />
                    <Modal
                      isOpen={openModalId === profileId.toString()}
                      toggleModal={() => toggleModal(profileId.toString())}
                      profileID={profileId}
                    >
                    </Modal>
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

export default AttackLogTable;
