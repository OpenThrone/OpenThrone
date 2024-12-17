import { Log } from "@/types/typings";
import { formatDate } from "@/utils/utilities";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";

interface PlayerOutcomeProps {
  log: Log;
  type: string;
  collapsed?: boolean;
}

const renderOutcome = (log: Log, type: string) => {
  if (type === 'defense') {
    return log.winner === log.defender_id ? <FontAwesomeIcon icon={faCheck} color='lightgreen' size='lg' /> : <FontAwesomeIcon icon={faXmark} color='red' size='lg' />;
  }
  return log.winner === log.attacker_id ? <FontAwesomeIcon icon={faCheck} color='lightgreen' size='lg' /> : <FontAwesomeIcon icon={faXmark} color='red' size='lg' />;
};

const PlayerOutcome: React.FC<PlayerOutcomeProps> = ({ log, type, collapsed = true }) => {
  const formattedDate = formatDate(log.timestamp);
  const player = type === 'defense' ? log.attackerPlayer : log.defenderPlayer;
  const playerId = type === 'defense' ? log.attacker_id : log.defender_id;

  return (
    <>
      <td className="border-b px-1 py-2 text-center">{renderOutcome(log, type)}</td>
      <td className="border-b px-4 py-2">
        <Link href={`/userprofile/${playerId}`} className="text-white">
          {player?.display_name || 'Unknown'}
        </Link>
        <br />
        {formattedDate}
        {!collapsed && (
          <>
            <br />
            Battle ID: {log.id}
          </>
        )}
      </td>
    </>
  );
};

export default PlayerOutcome;