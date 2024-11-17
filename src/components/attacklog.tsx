import { faPlus, faMinus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Stack, Chip, SimpleGrid, Button, Modal } from "@mantine/core";
import router from "next/router";
import { useState } from "react";
import LossesList from "./LossesList";
import PlayerOutcome from "./PlayerOutcome";
import StatsList from "./StatsList";
import { Log } from "@/types/typings";

interface AttackLogTableProps {
  logs: Log[];
  type: string;
}

const AttackLogTable: React.FC<AttackLogTableProps> = ({ logs, type }) => {
  const isEmpty = logs.length === 0;
  const tableHeaders = ['', 'Outcome', 'Attack on player', 'Pillage and Experience', 'Casualties', 'Action'];

  const [openModalId, setOpenModalId] = useState<string | null>(null);
  const [collapsedLogs, setCollapsedLogs] = useState<Record<string, boolean>>({});

  const toggleCollapse = (logId: string) => {
    setCollapsedLogs((prev) => ({ ...prev, [logId]: !prev[logId] }));
  };

  const toggleModal = (id: string) => {
    setOpenModalId((prevId) => (prevId === id ? null : id));
  };

  return (
    <table className="min-w-full table-auto bg-gray-900 rounded">
      <thead>
        <tr>
          {tableHeaders.map((header) => (
            <th key={header} className={`border-b px-${header === 'Outcome' ? '1' : '4'} py-2`}>
              {header}
            </th>
          ))}
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
          logs.map((log) => {
            const isCollapsed = collapsedLogs[log.id] ?? true;
            const profileId = type === 'defense' ? log.attacker_id : log.defender_id;
            const modalLabel = type === 'defense' ? 'Attack Back' : 'Attack Again';

            return (
              <tr key={log.id} className="odd:bg-table-odd even:bg-table-even">
                <td className="border-b px-1 py-2 text-center">
                  <button onClick={() => toggleCollapse(log.id)} aria-expanded={!isCollapsed} className="focus:outline-none">
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
                  <SimpleGrid cols={2} mt="sm" mb="sm">
                    <Button
                      type="button"
                      onClick={() => toggleModal(profileId)}
                      color="brand"
                      className="font-bold py-2 px-4 rounded"
                      size="xs"
                    >
                      {modalLabel}
                    </Button>
                    <Modal
                      isOpen={openModalId === profileId}
                      toggleModal={() => toggleModal(profileId)}
                      profileID={parseInt(profileId)}
                    />
                    <Button
                      onClick={() => router.push(`/battle/results/${log.id}`)}
                      size="xs"
                      className="font-bold py-2 px-4 rounded"
                      color="brand.5"
                    >
                      View Battle
                    </Button>
                  </SimpleGrid>
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