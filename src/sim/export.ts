import {
  AutonomousRunArtifact,
  PersonaComparisonResult,
  TopPlayerTimelinePoint,
} from './types';

function escapeCsv(value: string | number): string {
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function rowsToCsv(rows: Array<Array<string | number>>): string {
  return rows
    .map((row) => row.map((cell) => escapeCsv(cell)).join(','))
    .join('\n');
}

export function comparisonToCsv(comparison: PersonaComparisonResult[]): string {
  const rows: Array<Array<string | number>> = [
    [
      'persona',
      'stopReason',
      'finalMaxLevel',
      'avgAttacksPerDay',
      'avgAttackerWinRate',
      'avgIntelSuccessRate',
      'attackerDamageMultiplier',
      'defenderCounterDamageMultiplier',
      'maxPillageSharePerAttack',
      'damageVarianceMin',
      'damageVarianceMax',
    ],
  ];

  for (const item of comparison) {
    rows.push([
      item.persona,
      item.stopReason,
      item.finalMaxLevel,
      item.avgAttacksPerDay,
      item.avgAttackerWinRate,
      item.avgIntelSuccessRate,
      item.finalBalance.attackerDamageMultiplier ?? '',
      item.finalBalance.defenderCounterDamageMultiplier ?? '',
      item.finalBalance.maxPillageSharePerAttack ?? '',
      item.finalBalance.damageVarianceMin ?? '',
      item.finalBalance.damageVarianceMax ?? '',
    ]);
  }

  return rowsToCsv(rows);
}

export function artifactDailyResultsToCsv(
  artifact: AutonomousRunArtifact,
): string {
  const rows: Array<Array<string | number>> = [
    [
      'persona',
      'day',
      'totalAttacks',
      'intelSuccessRate',
      'attackerWinRate',
      'defenderWinRate',
      'avgTurnsPerAttack',
      'totalLootTransferred',
      'totalAttackerCasualties',
      'totalDefenderCasualties',
      'playersDefeated',
      'avgFortDamage',
      'lowTurnAttacks',
      'highTurnAttacks',
    ],
  ];

  for (const day of artifact.dailyResults) {
    rows.push([
      artifact.persona,
      day.day,
      day.totalAttacks,
      day.intelSuccessRate,
      day.attackerWinRate,
      day.defenderWinRate,
      day.avgTurnsPerAttack,
      day.totalLootTransferred,
      day.totalAttackerCasualties,
      day.totalDefenderCasualties,
      day.playersDefeated,
      day.avgFortDamage,
      day.lowTurnAttacks,
      day.highTurnAttacks,
    ]);
  }

  return rowsToCsv(rows);
}

export function artifactTopPlayerTimelinesToCsv(
  artifact: AutonomousRunArtifact,
): string {
  const rows: Array<Array<string | number>> = [
    [
      'persona',
      'playerId',
      'iteration',
      'level',
      'gold',
      'goldInBank',
      'status',
      'power',
    ],
  ];

  for (const [playerId, points] of Object.entries(
    artifact.topPlayerTimelines,
  )) {
    for (const point of points as TopPlayerTimelinePoint[]) {
      rows.push([
        artifact.persona,
        playerId,
        point.iteration,
        point.level,
        point.gold,
        point.goldInBank,
        point.status,
        point.power,
      ]);
    }
  }

  return rowsToCsv(rows);
}

export function artifactFinalPopulationToCsv(
  artifact: AutonomousRunArtifact,
): string {
  const rows: Array<Array<string | number>> = [
    [
      'persona',
      'id',
      'displayName',
      'level',
      'gold',
      'goldInBank',
      'status',
      'power',
    ],
  ];

  for (const player of artifact.finalPopulation) {
    rows.push([
      artifact.persona,
      player.id,
      player.displayName,
      player.level,
      player.gold,
      player.goldInBank,
      player.status,
      player.power,
    ]);
  }

  return rowsToCsv(rows);
}
