import { faPlus, faMinus, faSort, faSortUp, faSortDown, faEye, faRedo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Stack, Chip } from "@mantine/core";
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

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortableColumn = 'outcome' | 'player' | 'pillage' | 'casualties' | null;

const AttackLogTable: React.FC<AttackLogTableProps> = ({ logs, type }) => {
  const isEmpty = logs.length === 0;
  const tableHeaders = ['', 'Outcome', 'Attack on player', 'Pillage and Experience', 'Casualties', 'Action'];

  const [openModalId, setOpenModalId] = useState<string | null>(null);
  const [collapsedLogs, setCollapsedLogs] = useState<Record<string, boolean>>({});
  
  // Add sorting state
  const [sortColumn, setSortColumn] = useState<SortableColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const toggleCollapse = (logId: string) => {
    setCollapsedLogs((prev) => ({ ...prev, [logId]: !prev[logId] }));
  };

  const toggleModal = (id: string) => {
    setOpenModalId((prevId) => (prevId === id ? null : id));
  };

  // Handle column sort
  const handleSort = (column: SortableColumn) => {
    // If clicking the same column, cycle through: asc -> desc -> null
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      // New column, start with ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Get sort icon for column header
  const getSortIcon = (column: SortableColumn) => {
    if (sortColumn !== column) return faSort;
    return sortDirection === 'asc' ? faSortUp : faSortDown;
  };

  // Apply sorting to logs
  const sortedLogs = useMemo(() => {
    if (!sortColumn || !sortDirection) return logs;
    
    return [...logs].sort((a, b) => {
      let compareResult = 0;
      
      switch(sortColumn) {
        case 'outcome':
          // Sort by victory/defeat
          const aWon = a.winner === (type === 'offense' ? a.attacker_id : a.defender_id);
          const bWon = b.winner === (type === 'offense' ? b.attacker_id : b.defender_id);
          compareResult = Number(aWon) - Number(bWon);
          break;
        case 'player':
          // Sort by player name
          const aName = type === 'defense' ? 
            (a.attackerPlayer?.display_name || '') : 
            (a.defenderPlayer?.display_name || '');
          const bName = type === 'defense' ? 
            (b.attackerPlayer?.display_name || '') : 
            (b.defenderPlayer?.display_name || '');
          // Simple string comparison with nullish coalescing
          compareResult = aName > bName ? 1 : aName < bName ? -1 : 0;
          break;
        case 'pillage':
          // Sort by gold pillaged
          compareResult = (a.stats.pillagedGold || 0) - (b.stats.pillagedGold || 0);
          break;
        case 'casualties':
          // Sort by total casualties
          const aCasualties = (type === 'offense' ? 
            (JSON.parse(a.stats.attacker_losses)?.total || 0) : 
            (JSON.parse(a.stats.defender_losses)?.total || 0));
          const bCasualties = (type === 'offense' ? 
            (JSON.parse(b.stats.attacker_losses)?.total || 0) : 
            (JSON.parse(b.stats.defender_losses)?.total || 0));
          compareResult = aCasualties - bCasualties;
          break;
      }
      
      return sortDirection === 'asc' ? compareResult : -compareResult;
    });
  }, [logs, sortColumn, sortDirection, type]);

  // Column header component with sort functionality
  const SortableHeader = ({ column, label }: { column: SortableColumn | null, label: string }) => {
    if (!column) {
      return <th key={label} className="border-b px-1 py-2">{label}</th>;
    }
    
    return (
      <th 
        key={label} 
        className={`border-b px-${label === 'Outcome' ? '1' : '4'} py-2 cursor-pointer hover:bg-gray-800`}
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center justify-center">
          {label}
          <FontAwesomeIcon 
            icon={getSortIcon(column)} 
            size="sm" 
            className="ml-1 opacity-70" 
          />
        </div>
      </th>
    );
  };

  return (
    <table className="min-w-full table-auto bg-gray-900 rounded">
      <thead>
        <tr>
          <SortableHeader column={null} label="" />
          <SortableHeader column="outcome" label="Outcome" />
          <SortableHeader column="player" label="Attack on player" />
          <SortableHeader column="pillage" label="Pillage and Experience" />
          <SortableHeader column="casualties" label="Casualties" />
          <SortableHeader column={null} label="Action" />
        </tr>
      </thead>
      <tbody>
        {isEmpty ? (
          <tr>
            <td colSpan={tableHeaders.length} className="text-center">
              No battles recorded
            </td>
          </tr>
        ) : (
          sortedLogs.map((log) => {
            const isCollapsed = collapsedLogs[log.id] ?? true;
            const profileId = type === 'defense' ? log.attacker_id : log.defender_id;
            const modalLabel = type === 'defense' ? 'Attack Back' : 'Attack Again';

            return (
              <tr key={log.id} className="odd:bg-table-odd even:bg-table-even">
                <td className="border-b px-1 py-2 text-center">
                  <button onClick={() => toggleCollapse(log.id.toString())} aria-expanded={!isCollapsed} className="focus:outline-none">
                    <FontAwesomeIcon icon={isCollapsed ? faPlus : faMinus} size="sm" />
                  </button>
                </td>
                <PlayerOutcome log={log} type={type} collapsed={isCollapsed} />
                <td className="border-b px-4 py-2">
                  <StatsList stats={log.stats} type={type} subType={log.type} collapsed={isCollapsed} />
                </td>
                <td className="border-b px-4 py-2">
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
                </td>
                <td className="border-b px-4 py-2 text-center">
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

                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
};

export default AttackLogTable;