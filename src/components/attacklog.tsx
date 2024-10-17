/* eslint-disable jsx-a11y/control-has-associated-label */
import type { BattleUnits } from '@/types/typings';
import { formatDate } from '@/utils/utilities';
import { faCheck, faMinus, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useState } from 'react';
import Modal from './modal';
import toLocale from '@/utils/numberFormatting';
import Link from 'next/link';
import { Button, Chip, Group, HoverCard, List, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import router from 'next/router';

interface Loss {
  total: number;
  units: BattleUnits[];
}

interface Stats {
  pillagedGold: number;
  xpEarned: {defender: number, attacker: number} | number;
  turns?: number;
  attacker_losses?: Loss;
  defender_losses?: Loss;
  forthpAtStart?: number;
  forthpAtEnd?: number;
}

interface Log {
  id: string;
  winner: string;
  attacker_id: string;
  defender_id: string;
  attackerPlayer?: { display_name: string };
  defenderPlayer?: { display_name: string };
  timestamp: string;
  stats: Stats;
  type: string;
}

interface LossesListProps {
  losses: Loss;
}

interface StatsListProps {
  stats: Stats;
  type: string;
  subType: string;
  collapsed: boolean;
}

interface PlayerOutcomeProps {
  log: Log;
  type: string;
  collapsed?: boolean;
}

interface AttackLogTableProps {
  logs: Log[];
  type: string;
}

const LossesList: React.FC<LossesListProps> = ({ losses }) => {
  if (losses.total === 0)
    return <span>0 Units</span>;
  if (Object.keys(losses).length === 0) {
    return <span>0 Units</span>;
  }
  if (Object.keys(losses.units).length === 0 && losses.total > 0) {
    return <span>{losses.total} Units</span>
  }
  
  const consolidateUnits = (units: BattleUnits[]): BattleUnits[] => {
    const consolidated: { [key: string]: BattleUnits } = {};

    units.forEach((unit) => {
      const key = `${unit.level}-${unit.type}`;
      if (!consolidated[key]) {
        consolidated[key] = { ...unit, quantity: 0 };
      }
      consolidated[key].quantity += unit.quantity;
    });

    return Object.values(consolidated);
  };

  const consolidatedUnits = consolidateUnits(losses.units);

  return (
    <HoverCard>
      <HoverCard.Target>
        <span>{losses.total} Units</span>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <List>
          {consolidatedUnits.map((unit, index) => (
            <List.Item key={index}>{unit.quantity}x Level {unit.level} {unit.type}</List.Item>
          ))}
        </List>
      </HoverCard.Dropdown>
    </HoverCard>
  );
};

const StatsList: React.FC<StatsListProps> = ({ id, stats, type, subType, collapsed }) => (
  <>
  { subType === 'attack' && 
      (
    <>
        {collapsed === true ? (
          <Group
            align='center'
            justify='center'
          >
            <Chip><i className="ra ra-gem ra-fw" /> Gold: {toLocale(stats.pillagedGold.toLocaleString())}</Chip>
            <Chip>XP: {typeof stats.xpEarned === 'object' ? stats.xpEarned.attacker : stats.xpEarned}</Chip>
          </Group>
        ) : (
            <Stack
              align="center"
              justify="center"
              gap="xs"
            >
            <Chip><i className="ra ra-gem ra-fw" /> Gold: {toLocale(stats.pillagedGold.toLocaleString())}</Chip>
            <Chip>XP: {typeof stats.xpEarned === 'object' ? stats.xpEarned.attacker : stats.xpEarned}</Chip>
            <Chip>Turns: {stats.turns}</Chip>
          </Stack>
        )
        }
    </>
    )
  }
  </>
);

const renderOutcome = (log: Log, type: string) => {
  if (type === 'defense') {
    return log.winner === log.defender_id ? <FontAwesomeIcon icon={faCheck} color='lightgreen' size='lg' /> : <FontAwesomeIcon icon={faXmark} color='red' size='lg' />;
  }
  return log.winner === log.attacker_id ? <FontAwesomeIcon icon={faCheck} color='lightgreen' size='lg' /> : <FontAwesomeIcon icon={faXmark} color='red' size='lg'/>;
};

const PlayerOutcome: React.FC<PlayerOutcomeProps> = ({ log, type, collapsed }) => {
  const [formattedDate, setFormattedDate] = useState('');

  useEffect(() => {
    // This will ensure the date is processed client-side
    setFormattedDate(formatDate(log.timestamp));
  }, [log.timestamp]);
  return (
    <>
      <td className="border-b px-1 py-2 text-center">
        {renderOutcome(log, type)}
        <br />
      </td>
      <td className="border-b px-4 py-2">
        {type === 'defense'
          ? <Link href={`/userprofile/${log.attackerPlayer?.id}`} className='text-white'>{log.attackerPlayer?.display_name}</Link> ?? 'Unknown'
          : <Link href={`/userprofile/${log.defenderPlayer?.id}`} className='text-white'>{log.defenderPlayer?.display_name}</Link> ?? 'Unknown'}
        <br />
        {collapsed && (
          <>
            {formattedDate}
          </>
        )}
        {!collapsed && (
          <>
          { formattedDate }
          < br />
            Battle ID: {log.id}
          </>
        )}
        
      </td>
    </>
  );
};

const AttackLogTable: React.FC<AttackLogTableProps> = ({ logs, type }) => {
  const isEmpty = logs.length === 0;
  const tableHeaders =
    ['','Outcome', 'Attack on player', 'Pillage and Experience', 'Casualties', 'Action'];

  const [openModalId, setOpenModalId] = useState<number | null>(null);
  const [collapsedLogs, setCollapsedLogs] = useState<{ [key: string]: boolean }>({});

  const toggleCollapse = (logId: string) => {
    setCollapsedLogs((prevState) => ({
      ...prevState,
      [logId]: !prevState[logId],
    }));
  };
  const toggleModal = (id: number) => {
    if (openModalId === id) {
      setOpenModalId(null); // Close modal
    } else {
      setOpenModalId(id); // Open modal for specific ID
    }
  };
  
  return (
    <table className="min-w-full table-auto bg-gray-900 rounded">
      <thead>
        <tr>
          {tableHeaders.map((header) => (
            //if the header key is 0 then px-1 else px-4
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
            const isCollapsed = collapsedLogs[log.id] ?? true; // Default to collapsed

            return (
              <React.Fragment key={log.id}>
                <tr className='odd:bg-table-odd even:bg-table-even'>
                  <td className='border-b px-1 py-2 text-center'>
                    <span onClick={() => toggleCollapse(log.id)} style={{ cursor: 'pointer' }} aria-expanded={!isCollapsed} role="button">
                      {isCollapsed ? (
                        <FontAwesomeIcon icon={faPlus} size="sm" />
                      ) : (
                        <FontAwesomeIcon icon={faMinus} size="sm" />
                      )}
                    </span>
                  </td>
                  {!isCollapsed && (
                    <>
                        <PlayerOutcome log={log} type={type} collapsed={isCollapsed} />
                      <td className="border-b px-4 py-2">
                        <StatsList id={log.id} stats={log.stats} type={type} subType={log.type} collapsed={false} />
                      </td>
                      <td className="border-b px-4 py-2">
                        <Stack
                          align="center"
                          justify="center"
                          gap="xs"
                        >
                          <Chip>
                            Attacker Losses: <LossesList losses={log.stats.attacker_losses || {}} />
                          </Chip>
                          <Chip>
                            Defender Losses: <LossesList losses={log.stats.defender_losses || {}} />
                          </Chip>
                          <Chip>
                            Fort Damage: {log.stats.forthpAtStart - log.stats.forthpAtEnd || 0}
                          </Chip>
                        </Stack>
                      </td>
                      <td className="border-b px-4 py-2 text-center">
                        <SimpleGrid cols={2} mt='sm' mb={'sm'}>
                          {type === 'defense' ? (
                            <>
                              <Button
                                type="button"
                                onClick={() => toggleModal(parseInt(log.attacker_id))}
                                color={"brand"}
                                className={`font-bold py-2 px-4 rounded `}
                                size='xs'
                              >
                                Attack Back
                              </Button>
                              <Modal
                                isOpen={openModalId === parseInt(log.attacker_id)}
                                toggleModal={() => toggleModal(parseInt(log.attacker_id))}
                                profileID={parseInt(log.attacker_id)}
                              />
                            </>
                          ) : (
                            <>
                              <Button
                                type="button"
                                onClick={() => toggleModal(parseInt(log.attacker_id))}
                                color={"brand"}
                                className={`font-bold py-2 px-4 rounded `}
                                size='xs'
                              >
                                Attack Again
                              </Button>
                              <Modal
                                isOpen={openModalId === parseInt(log.defender_id)}
                                toggleModal={() => toggleModal(parseInt(log.defender_id))}
                                profileID={parseInt(log.defender_id)}
                              />
                            </>
                          )}
                          <Button onClick={() => router.push(`/battle/results/${log.id}`)} size='xs' className='font-bold py-2 px-4 rounded' color="brand.5">
                            View Battle
                          </Button>
                        </SimpleGrid>
                      </td>
                    </>
                  )}
                  {isCollapsed && (
                    <>
                        <PlayerOutcome log={log} type={type} collapsed={isCollapsed} />
                      <td className="border-b px-4 py-2">
                        <StatsList stats={log.stats} type={type} subType={log.type} collapsed={true} />
                      </td>
                      <td className="border-b px-4 py-2">...</td>
                      <td className="border-b px-4 py-2 text-center">
                        <SimpleGrid cols={2} mt='sm' mb={'sm'}>
                          {type === 'defense' ? (
                            <>
                              <Button
                                type="button"
                                onClick={() => toggleModal(parseInt(log.attacker_id))}
                                color={"brand"}
                                className={`font-bold py-2 px-4 rounded `}
                                size='xs'
                              >
                                Attack Back
                              </Button>
                              <Modal
                                isOpen={openModalId === parseInt(log.attacker_id)}
                                toggleModal={() => toggleModal(parseInt(log.attacker_id))}
                                profileID={parseInt(log.attacker_id)}
                              />
                            </>
                          ) : (
                            <>
                              <Button
                                type="button"
                                onClick={() => toggleModal(parseInt(log.attacker_id))}
                                color={"brand"}
                                className={`font-bold py-2 px-4 rounded `}
                                size='xs'
                              >
                                Attack Again
                              </Button>
                              <Modal
                                isOpen={openModalId === parseInt(log.defender_id)}
                                toggleModal={() => toggleModal(parseInt(log.defender_id))}
                                profileID={parseInt(log.defender_id)}
                              />
                            </>
                          )}
                          <Button onClick={() => router.push(`/battle/results/${log.id}`)} size='xs' className='font-bold py-2 px-4 rounded' color="brand.5">
                            View Battle
                          </Button>
                        </SimpleGrid>
                      </td>
                    </>
                  )}
                </tr>
              </React.Fragment>
            );
          })
        )}
      </tbody>
    </table>
  );
};

export default AttackLogTable;
