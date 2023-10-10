import { UnitTypes } from "@/constants";

const AttackLogTable = ({ logs, type }) => {
  // This helper function takes in the type and level and returns the name of the unit
  const getUnitName = (type, level) => {
    const unit = UnitTypes.find(u => u.type === type && u.level === level);
    return unit ? unit.name : "Unknown";
  };

  if (logs.length > 0) {
    return (
      <table className="min-w-full bg-black">
        <thead>
          <tr>
            {type === 'defense' ? (
              <th className="border-b px-4 py-2">Attacker</th>
            ) : (
              <th className="border-b px-4 py-2">Defender</th>
            )}
            <th className="border-b px-4 py-2">Winner</th>
            <th className="border-b px-4 py-2">Stats</th>
            <th className="border-b px-4 py-2">Casualties</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              {type === 'defense' ? (
                <td className="border-b px-4 py-2">
                  {log.attackerPlayer?.display_name || 'Unknown'}<br />
                  {new Date(log.timestamp).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </td>
              ) : (
                <td className="border-b px-4 py-2">
                    {log.defenderPlayer?.display_name || 'Unknown'}<br />
                    {new Date(log.timestamp).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                </td>
              )}
              
              <td className="border-b px-4 py-2">
                {log.winner === log.attacker_id ? 'Attacker' : 'Defender'}
              </td>
              <td className="border-b px-4 py-2">
                <ul>
                  <li>
                    Pillaged Gold: {log.stats.pillagedGold.toLocaleString()}
                  </li>
                  <li>Offense Points: {log.stats.offensePoints}</li>
                  <li>Defense Points: {log.stats.defensePoints}</li>
                  <li>XP Earned: {log.stats.xpEarned}</li>
                  <li>Fort Damage: {log.stats.fortDamage.toLocaleString()}</li>
                  <li>Turns Used: {log.stats.turns}</li>
                </ul>
              </td>
              <td className="border-b px-4 py-2">
                <ul>
                  <li>Attacker Losses:
                    {Object.keys(log.stats.attacker_losses).length === 0 ? (
                      "No losses"
                    ) : (
                      <ul>
                        {Object.entries(log.stats.attacker_losses).map(([key, value]) => {
                          const [type, level] = key.split('-');
                          return (
                            <li key={key}>
                              {getUnitName(type, parseInt(level))}: {value}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>

                  <li>Defender Losses:
                    {Object.keys(log.stats.defender_losses).length === 0 ? (
                      "No losses"
                    ) : (
                      <ul>
                        {Object.entries(log.stats.defender_losses).map(([key, value]) => {
                          const [type, level] = key.split('-');
                          return (
                            <li key={key}>
                              {getUnitName(type, parseInt(level))}: {value}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>

                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <table className="min-w-full bg-black">
      <thead>
        <tr>
          <th className="border-b px-4 py-2">Attacker</th>
          <th className="border-b px-4 py-2">Defender</th>
          <th className="border-b px-4 py-2">Time of Attack</th>
          <th className="border-b px-4 py-2">Winner</th>
          <th className="border-b px-4 py-2">Stats</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td colSpan="5" className="text-center">
            No battles recorded
          </td>
        </tr>
      </tbody>
    </table>
  );
};

export default AttackLogTable;
