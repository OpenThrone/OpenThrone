import { faBuilding } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'next-i18next';

import { toLocale } from '@/utils/numberFormatting';

import { MissionLog, SpyReportShell } from './SpyReportShell';

/** Infiltration report, written from the spymaster's or the target's side. */
const InfiltrationResult = ({ battle, lastGenerated, viewerID }) => {
  const { t } = useTranslation('common');
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const spy = stats?.spyResults ?? {};
  const isViewerDefender = viewerID === defenderPlayer?.id;
  const view = isViewerDefender ? 'defender' : 'attacker';
  const sent = Number(spy.spiesSent ?? 0);
  const lost = Number(spy.spiesLost ?? 0);
  const succeeded = winner === attackerPlayer?.id;

  const lines = [
    t(`spyReport.infiltration.${view}.sent`, {
      count: sent,
      attacker: attackerPlayer?.display_name,
      defender: defenderPlayer?.display_name,
    }),
    succeeded
      ? t(`spyReport.infiltration.${view}.damage`, {
          damage: toLocale(Number(spy.fortDmg ?? 0)),
        })
      : t(`spyReport.infiltration.${view}.caught`),
    lost > 0
      ? t(`spyReport.${view}SpiesLost`, { count: lost })
      : t(`spyReport.${view}NoSpiesLost`),
  ];

  return (
    <SpyReportShell
      battle={battle}
      viewerID={viewerID}
      mission="infiltrate"
      icon={faBuilding}
      lastGenerated={lastGenerated}
    >
      <MissionLog title={t('spyReport.missionLog')} lines={lines} />
    </SpyReportShell>
  );
};

export default InfiltrationResult;
