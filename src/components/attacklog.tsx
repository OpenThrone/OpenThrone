/* eslint-disable jsx-a11y/control-has-associated-label */
import type { BattleUnits } from '@/types/typings';
import { formatDate } from '@/utils/utilities';
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useState } from 'react';
import Modal from './modal';
import toLocale from '@/utils/numberFormatting';
import Link from 'next/link';
import { HoverCard, List, Text } from '@mantine/core';

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
}

interface LossesListProps {
  losses: Loss;
}

interface StatsListProps {
  stats: Stats;
  type: string;
}

interface PlayerOutcomeProps {
  log: Log;
  type: string;
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

const StatsList: React.FC<StatsListProps> = ({ stats, type }) => (
  <ul>
    <li>Pillaged Gold: {toLocale(stats.pillagedGold.toLocaleString())}</li>
    <li>XP Earned: {(typeof stats.xpEarned === 'object' ? '[Defender: ' + stats.xpEarned.defender + ' | Attacker: ' +stats.xpEarned.attacker + ']' : String(stats.xpEarned))}</li>
    {type !== 'defense' ? <li>Turns Used: {stats.turns}</li> : ''}
  </ul>
);

const renderOutcome = (log: Log, type: string) => {
  if (type === 'defense') {
    return log.winner === log.defender_id ? <FontAwesomeIcon icon={faCheck} color='lightgreen' size='lg' /> : <FontAwesomeIcon icon={faXmark} color='red' size='lg' />;
  }
  return log.winner === log.attacker_id ? <FontAwesomeIcon icon={faCheck} color='lightgreen' size='lg' /> : <FontAwesomeIcon icon={faXmark} color='red' size='lg'/>;
};

const PlayerOutcome: React.FC<PlayerOutcomeProps> = ({ log, type }) => {
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
        {formattedDate}
      </td>
    </>
  );
};

const AttackLogTable: React.FC<AttackLogTableProps> = ({ logs, type }) => {
  const isEmpty = logs.length === 0;
  const tableHeaders =
    ['Outcome', 'Attack on player', 'Pillage and Experience', 'Casualties', 'Action'];

  const [openModalId, setOpenModalId] = useState<number | null>(null);

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
          logs.map((log) => (
            <tr key={log.id} className='odd:bg-table-odd even:bg-table-even'>
              <PlayerOutcome log={log} type={type} />
              <td className="border-b px-4 py-2">
                <StatsList stats={log.stats} type={type} />
              </td>
              <td className="border-b px-4 py-2">
                <ul>
                  <li>
                    Attacker Losses:{' '}
                    <LossesList losses={log.stats.attacker_losses || {}} />
                  </li>
                  <li>
                    Defender Losses:{' '}
                    <LossesList losses={log.stats.defender_losses || {}} />
                  </li>
                </ul>
              </td>
              <td className="border-b px-4 py-2 text-center">
                {type === 'defense' ? (
                 <> <button
                type="button"
                onClick={(()=> toggleModal(parseInt(log.attacker_id)))}
                    className={`bg-red-500 text-white font-bold py-2 px-4 rounded hover:bg-red-700 `}
              >
                Attack Back              </button>
              <Modal
                      isOpen={openModalId === parseInt(log.attacker_id)}
                      toggleModal={(() => toggleModal(parseInt(log.attacker_id)))}
                      profileID={parseInt(log.attacker_id)}
              /></>
                  
                
              ) : (
                  <a href={`/battle/results/${log.id}`} className='inline-block bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 '>View Battle</a>
              
                )}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
};

export default AttackLogTable;
