/* eslint-disable jsx-a11y/control-has-associated-label */
import type { UnitType } from '@/types/typings';
import { formatDate, getUnitName } from '@/utils/utilities';
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState } from 'react';
import Modal from './modal';
import { alertService } from '@/services';
import router from 'next/router';
import { useUser } from '@/context/users';
import { stringifyObj } from '@/utils/numberFormatting';

interface Loss {
  [key: string]: number;
}

interface Stats {
  pillagedGold: number;
  xpEarned: number;
  turns?: number; // Assuming turns can be optional
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

const isValidUnitType = (type: any): type is UnitType => {
  return ['CITIZEN', 'WORKER', 'OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].includes(
    type
  );
};

const LossesList: React.FC<LossesListProps> = ({ losses }) => {
  if (Object.keys(losses).length === 0) {
    return <span>0 Units</span>;
  }
  if (losses.total === 0) 
    return <span>0 Units</span>;

  return (
    <ul>
      {Object.entries(losses).map(([key, value]) => {
        const [type, levelStr] = key.split('-');

        // Ensure that levelStr is not undefined
        if (typeof levelStr === 'undefined') {
          console.warn(`Level string is undefined for key '${key}'`);
          return null; // Skip this item
        }

        const level = parseInt(levelStr, 10);

        // Check if level is a valid number
        if (Number.isNaN(level)) {
          console.warn(`Invalid level '${levelStr}' for key '${key}'`);
          return null; // Skip this item if level is not valid
        }

        if (typeof type === 'undefined') {
          console.warn('Type is undefined for key', key);
          return null; // Skip this item
        }

        if (!isValidUnitType(type)) {
          console.warn(`Invalid unit type '${type}' for key '${key}'`);
          return null; // Skip this item
        }

        return (
          <li key={key}>
            {getUnitName(type, level)}: {value}
          </li>
        );
      })}
    </ul>
  );
};

const StatsList: React.FC<StatsListProps> = ({ stats, type }) => (
  <ul>
    <li>Pillaged Gold: {stats.pillagedGold.toLocaleString()}</li>
    <li>XP Earned: {stats.xpEarned}</li>
    {type !== 'defense' ? <li>Turns Used: {stats.turns}</li> : ''}
  </ul>
);

const renderOutcome = (log: Log, type: string) => {
  if (type === 'defense') {
    return log.winner === log.defender_id ? <FontAwesomeIcon icon={faCheck} color='lightgreen' size='lg' /> : <FontAwesomeIcon icon={faXmark} color='red' size='lg' />;
  }
  return log.winner === log.attacker_id ? <FontAwesomeIcon icon={faCheck} color='lightgreen' size='lg' /> : <FontAwesomeIcon icon={faXmark} color='red' size='lg'/>;
};

const PlayerOutcome: React.FC<PlayerOutcomeProps> = ({ log, type }) => (
  <>
    <td className="border-b px-1 py-2 text-center">
      {renderOutcome(log, type)}
      <br />
    </td>
    <td className="border-b px-4 py-2">
      {type === 'defense'
        ? <a href={`/userprofile/${log.attackerPlayer?.id}`} className='text-white'>{log.attackerPlayer?.display_name}</a> ?? 'Unknown'
        : <a href={`/userprofile/${log.defenderPlayer?.id}`} className='text-white'>{log.defenderPlayer?.display_name}</a> ?? 'Unknown'}
      <br />
      {formatDate(log.timestamp)}
    </td>
  </>
);

const AttackLogTable: React.FC<AttackLogTableProps> = ({ logs, type }) => {
  const isEmpty = logs.length === 0;
  const tableHeaders =
    ['Outcome', 'Attack on player', 'Pillage and Experience', 'Casualties', 'Action'];



  const context = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const toggleModal = () => {
    setIsOpen(!isOpen);
  };

  const handleSubmit = async (turns: number, profileID: number) => {
    if (!turns) turns = 1;
    console.log(turns, profileID)
    const res = await fetch(`/api/attack/${profileID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stringifyObj({ turns })),
    });
    const results = await res.json();

    if (results.status === 'failed') {
      alertService.error(results.status);
    } else {
      context.forceUpdate();
      router.push(`/battle/results/${results.attack_log}`);
      toggleModal();
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
                onClick={toggleModal}
                    className={`bg-red-500 text-white font-bold py-2 px-4 rounded hover:bg-red-700 `}
              >
                Attack Back              </button>
              <Modal
                isOpen={isOpen}
                toggleModal={toggleModal}
                      onSubmit={handleSubmit}
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
