import { faUserSecret } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'next-i18next';

import { MissionLog, SpyReportShell } from './SpyReportShell';

const TARGET_KEYS: Record<string, string> = {
  'CITIZEN/WORKERS': 'spyReport.targets.citizens',
  CITIZEN_WORKERS: 'spyReport.targets.citizens',
  OFFENSE: 'spyReport.targets.offense',
  DEFENSE: 'spyReport.targets.defense',
};

/** Assassination report, written from the spymaster's or the target's side. */
const AssassinateResult = ({ battle, viewerID, lastGenerated = undefined }) => {
  const { t } = useTranslation('common');
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const spy = stats?.spyResults ?? {};
  const isViewerDefender = viewerID === defenderPlayer?.id;
  const killed = Number(spy.unitsKilled ?? 0);
  const lost = Number(spy.spiesLost ?? 0);
  const sent = Number(spy.spiesSent ?? 0);
  const succeeded = winner === attackerPlayer?.id && killed > 0;
  const target = t(
    TARGET_KEYS[spy.unit ?? spy.targetUnit] ?? 'spyReport.targets.units',
  );
  const view = isViewerDefender
    ? 'defender'
    : viewerID === attackerPlayer?.id
      ? 'attacker'
      : 'shared';

  const lines = [
    t(`spyReport.assassination.${view}.sent`, {
      count: sent,
      attacker: attackerPlayer?.display_name,
      defender: defenderPlayer?.display_name,
      target,
    }),
    succeeded
      ? t(`spyReport.assassination.${view}.killed`, { count: killed, target })
      : t(`spyReport.assassination.${view}.noKills`, { target }),
    lost > 0
      ? t(`spyReport.${view}SpiesLost`, { count: lost })
      : t(`spyReport.${view}NoSpiesLost`),
  ];

  return (
    <SpyReportShell
      battle={battle}
      viewerID={viewerID}
      mission="assassinate"
      icon={faUserSecret}
      lastGenerated={lastGenerated}
    >
      <MissionLog title={t('spyReport.missionLog')} lines={lines} />
    </SpyReportShell>
  );
};

export default AssassinateResult;
