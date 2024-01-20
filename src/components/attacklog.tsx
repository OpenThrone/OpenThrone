/* eslint-disable jsx-a11y/control-has-associated-label */
import type { UnitType } from '@/types/typings';
import { formatDate, getUnitName } from '@/utils/utilities';

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
    return <span>No losses</span>;
  }

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
    return log.winner === log.defender_id ? 'Y' : 'N';
  }
  return log.winner === log.attacker_id ? 'Y' : 'N';
};

const PlayerOutcome: React.FC<PlayerOutcomeProps> = ({ log, type }) => (
  <>
    <td className="border-b px-4 py-2">
      {renderOutcome(log, type)}
      <br />
    </td>
    <td className="border-b px-4 py-2">
      {type === 'defense'
        ? log.attackerPlayer?.display_name ?? 'Unknown'
        : log.defenderPlayer?.display_name ?? 'Unknown'}
      <br />
      {formatDate(log.timestamp)}
    </td>
  </>
);

const AttackLogTable: React.FC<AttackLogTableProps> = ({ logs, type }) => {
  const isEmpty = logs.length === 0;
  const tableHeaders =
    type === 'defense'
      ? [
          'Outcome',
          'Attack from player',
          'Pillage and Experience',
          'Casualties',
        ]
      : ['Outcome', 'Attack on player', 'Pillage and Experience', 'Casualties'];

  return (
    <table className="min-w-full bg-black">
      <thead>
        <tr>
          {tableHeaders.map((header) => (
            <th key={header} className="border-b px-4 py-2">
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
            <tr key={log.id}>
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
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
};

export default AttackLogTable;
