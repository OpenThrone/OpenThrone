const AttackLogTable = ({ logs }) => {
  if (logs.length > 0) {
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
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="border-b px-4 py-2">
                {log.attackerPlayer?.display_name || 'Unknown'}
              </td>
              <td className="border-b px-4 py-2">
                {log.defenderPlayer?.display_name || 'Unknown'}
              </td>
              <td className="border-b px-4 py-2">
                {new Date(log.timestamp).toLocaleString()}
              </td>
              <td className="border-b px-4 py-2">
                {log.winner === log.attacker_id ? 'Attacker' : 'Defender'}
              </td>
              <td className="border-b px-4 py-2">
                <ul>
                  <li>Pillaged Gold: {log.stats.pillagedGold}</li>
                  <li>Offense Points: {log.stats.offensePoints}</li>
                  <li>Defense Points: {log.stats.defensePoints}</li>
                  <li>XP Earned: {log.stats.xpEarned}</li>
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
