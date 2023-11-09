import { UnitTypes } from "@/constants";

const getUnitName = (type, level) => {
  const unit = UnitTypes.find(u => u.type === type && u.level === level);
  return unit ? unit.name : "Unknown";
};

const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const LossesList = ({ losses }) => {
  if (Object.keys(losses).length === 0) {
    return "No losses";
  }

  return (
    <ul>
      {Object.entries(losses).map(([key, value]) => {
        const [type, level] = key.split('-');
        return <li key={key}>{getUnitName(type, parseInt(level))}: {value}</li>;
      })}
    </ul>
  );
};

const StatsList = ({ stats, type }) => (
  <ul>
    <li>Pillaged Gold: {stats.pillagedGold.toLocaleString()}</li>
    <li>XP Earned: {stats.xpEarned}</li>
    {type !== 'defense' ? <li>Turns Used: {stats.turns}</li> : ''}
  </ul>
);

const PlayerOutcome = ({ log, type }) => (
  <><td className="border-b px-4 py-2">
    {type === 'defense' ? (log.winner === log.defender_id ? 'Y' : 'N'):(log.winner === log.attacker_id ? 'Y': 'N')}<br />
  </td>
  <td className="border-b px-4 py-2">
    {type === 'defense' ? log.attackerPlayer?.display_name : log.defenderPlayer?.display_name}  <br />
    {formatDate(log.timestamp)}
  </td></>
);

const AttackLogTable = ({ logs, type }) => {
  const isEmpty = logs.length === 0;
  const tableHeaders = type === 'defense' ? ['Outcome', 'Attack from player', 'Pillage and Experience', 'Casualties'] : ['Outcome', 'Attack on player', 'Pillage and Experience', 'Casualties'];

  return (
    <table className="min-w-full bg-black">
      <thead>
        <tr>
          {tableHeaders.map((header) => (
            <th key={header} className="border-b px-4 py-2">{header}</th>
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
                  <li>Attacker Losses: <LossesList losses={log.stats.attacker_losses || {}} /></li>
                  <li>Defender Losses: <LossesList losses={log.stats.defender_losses || {}} /></li>
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
