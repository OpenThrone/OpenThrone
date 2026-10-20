/** Only permission-redacted report facts may cross this boundary. */
export interface BattleRecommendationFacts {
  army: number | null;
  deaths: number | null;
  wounded: number | null;
  enemyDeaths: number | null;
  damageDealt: number | null;
  damageReceived: number | null;
  turns: number | null;
}
export interface RecommendationEvidence {
  id: number;
  timestamp: string;
  kind: 'intel' | 'battle';
  defense: number | null;
  won: boolean | null;
  battle?: BattleRecommendationFacts;
}
export type DefenderActivity = 'online' | 'recent' | 'offline' | 'unknown';
export type RecommendationVerdict =
  | 'favorable'
  | 'limited'
  | 'caution'
  | 'conflicting'
  | 'stale'
  | 'insufficient';
export interface AssessedEvidence extends RecommendationEvidence {
  confidence: number;
  quality: 'decisive' | 'costly' | 'ordinary' | 'unknown';
}
export interface AttackRecommendation {
  verdict: RecommendationVerdict;
  evidence: AssessedEvidence[];
  activity: DefenderActivity;
  assessedAt: string;
}
export const RECOMMENDATION_HISTORY_MS = 24 * 60 * 60 * 1000;
const MINUTE = 60_000;

export function defenderActivity(
  lastActive: number | null,
  now: number,
): DefenderActivity {
  if (lastActive === null || !Number.isFinite(lastActive) || lastActive > now)
    return 'unknown';
  const age = now - lastActive;
  return age <= 15 * MINUTE
    ? 'online'
    : age <= 60 * MINUTE
      ? 'recent'
      : 'offline';
}

/** Integrate activity exposure since the report. Offline transitions never undo aging.
 * Last activity after a report conservatively counts the preceding interval as active.
 * Effective aging: online 3x, recently active 1.5x, offline 1x; unknown 3x.
 */
export function evidenceConfidence(
  timestamp: string,
  lastActive: number | null,
  now: number,
): number {
  const start = Date.parse(timestamp);
  const age = now - start;
  if (!Number.isFinite(age) || age < 0) return 0;
  if (defenderActivity(lastActive, now) === 'unknown')
    return Math.max(0, 1 - (age * 3) / (60 * MINUTE));
  const active = lastActive as number;
  const onlineExposure = Math.max(
    0,
    Math.min(now, active + 15 * MINUTE) - start,
  );
  const recentExposure = Math.max(
    0,
    Math.min(now, active + 60 * MINUTE) - Math.max(start, active + 15 * MINUTE),
  );
  return Math.max(
    0,
    1 - (age + 2 * onlineExposure + 0.5 * recentExposure) / (60 * MINUTE),
  );
}

export function battleQuality(
  facts?: BattleRecommendationFacts,
): AssessedEvidence['quality'] {
  if (!facts) return 'unknown';
  const {
    army,
    deaths,
    wounded,
    enemyDeaths,
    damageDealt,
    damageReceived,
    turns,
  } = facts;
  if (
    [
      army,
      deaths,
      wounded,
      enemyDeaths,
      damageDealt,
      damageReceived,
      turns,
    ].some((value) => value === null || !Number.isFinite(value) || value < 0) ||
    army <= 0 ||
    turns < 1 ||
    turns > 10 ||
    deaths + wounded > army
  )
    return 'unknown';
  const casualtyShare = (deaths + wounded) / army;
  if (
    casualtyShare >= 0.15 ||
    (damageReceived > 0 && damageReceived >= damageDealt)
  )
    return 'costly';
  // Strong results at any commitment (including ten turns) need both low own
  // losses and impact; they do not imply a recommended turn count.
  if (
    casualtyShare <= 0.05 &&
    enemyDeaths > 0 &&
    enemyDeaths >= Math.max(1, (deaths + wounded) * 3) &&
    damageDealt > 0 &&
    damageDealt >= damageReceived * 2
  )
    return 'decisive';
  return 'ordinary';
}

export function assessAttackRecommendation(
  reports: RecommendationEvidence[],
  offense: number,
  now = Date.now(),
  lastActive: number | null = null,
  currentArmy?: number,
): AttackRecommendation {
  const evidence: AssessedEvidence[] = reports
    .filter((report) => {
      const age = now - Date.parse(report.timestamp);
      return (
        Number.isFinite(age) && age >= 0 && age <= RECOMMENDATION_HISTORY_MS
      );
    })
    .sort(
      (a, b) =>
        Date.parse(b.timestamp) - Date.parse(a.timestamp) || b.id - a.id,
    )
    .slice(0, 5)
    .map((report) => ({
      ...report,
      confidence: evidenceConfidence(report.timestamp, lastActive, now),
      quality:
        report.kind === 'battle' ? battleQuality(report.battle) : 'unknown',
    }));
  const fresh = evidence.filter((report) => report.confidence > 0);
  const signals = fresh.flatMap((report) => {
    if (!Number.isFinite(offense) || offense <= 0) return [];
    if (report.kind === 'battle') {
      if (report.won === null) return [];
      const armyComparable =
        Number.isFinite(currentArmy) &&
        report.battle?.army > 0 &&
        currentArmy >= report.battle.army * 0.8;
      return [
        {
          report,
          positive: report.won && report.quality !== 'costly',
          strong: report.won && report.quality === 'decisive' && armyComparable,
        },
      ];
    }
    if (
      report.defense === null ||
      !Number.isFinite(report.defense) ||
      report.defense < 0
    )
      return [];
    return [
      { report, positive: offense >= report.defense * 1.5, strong: false },
    ];
  });
  const positive = signals.some((signal) => signal.positive);
  const negative = signals.some((signal) => !signal.positive);
  // A newer defeat/costly result takes precedence over older favorable signals.
  const newest = signals[0];
  const latestNegative =
    newest &&
    !newest.positive &&
    signals.every((signal) =>
      signal.positive
        ? Date.parse(signal.report.timestamp) <
          Date.parse(newest.report.timestamp)
        : true,
    );
  const strongBattle = signals.some(
    (signal) => signal.strong && signal.report.confidence > 0.5,
  );
  const corroborated =
    signals.some(
      (signal) =>
        signal.report.kind === 'intel' &&
        signal.positive &&
        signal.report.confidence > 0.5,
    ) &&
    signals.some(
      (signal) =>
        signal.report.kind === 'battle' &&
        signal.positive &&
        signal.report.confidence > 0.5 &&
        signal.report.quality !== 'unknown' &&
        Number.isFinite(currentArmy) &&
        signal.report.battle?.army > 0 &&
        currentArmy >= signal.report.battle.army * 0.8,
    );
  const verdict: RecommendationVerdict = latestNegative
    ? 'caution'
    : positive && negative
      ? 'conflicting'
      : negative
        ? 'caution'
        : positive
          ? strongBattle || corroborated
            ? 'favorable'
            : 'limited'
          : evidence.length && !fresh.length
            ? 'stale'
            : 'insufficient';
  return {
    verdict,
    evidence,
    activity: defenderActivity(lastActive, now),
    assessedAt: new Date(now).toISOString(),
  };
}
