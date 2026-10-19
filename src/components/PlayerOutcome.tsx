import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

import type { Log } from '@/types/typings';
import { formatDate } from '@/utils/utilities';

interface PlayerOutcomeProps {
  log: Log;
  type: string;
  collapsed?: boolean;
}

const renderOutcome = (
  log: Log,
  type: string,
  labels: { won: string; lost: string },
) => {
  const won =
    type === 'defense'
      ? log.winner === log.defender_id
      : log.winner === log.attacker_id;
  return won ? (
    <FontAwesomeIcon
      icon={faCheck}
      color="lightgreen"
      size="lg"
      title={labels.won}
    />
  ) : (
    <FontAwesomeIcon icon={faXmark} color="red" size="lg" title={labels.lost} />
  );
};

const PlayerOutcome: React.FC<PlayerOutcomeProps> = ({
  log,
  type,
  collapsed = true,
}) => {
  const { t } = useTranslation('battle');
  const formattedDate = formatDate(log.timestamp);
  const player = type === 'defense' ? log.attackerPlayer : log.defenderPlayer;
  const playerId = type === 'defense' ? log.attacker_id : log.defender_id;

  return (
    <>
      <td className="border-b px-1 py-2 text-center">
        {renderOutcome(log, type, {
          won: t('warHistory.won'),
          lost: t('warHistory.lost'),
        })}
      </td>
      <td className="border-b px-4 py-2">
        <Link href={`/userprofile/${playerId}`} className="text-white">
          {player?.display_name || t('warHistory.unknownPlayer')}
        </Link>
        <br />
        {formattedDate}
        {!collapsed && (
          <>
            <br />
            {t('timeline.battleId', { id: log.id })}
          </>
        )}
      </td>
    </>
  );
};

export default PlayerOutcome;
