import type { Prisma } from '@/lib/prisma-exports';

/** Admin reports use an allowlist: never return sealed replay material or seeds. */
export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function combatSnapshot(value: unknown) {
  const source = asRecord(value);
  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const key of [
    'gold',
    'experience',
    'attackTurns',
    'stamina',
    'fortHitpoints',
  ]) {
    if (typeof source[key] === 'number' || typeof source[key] === 'string')
      result[key] = source[key] as string | number;
  }
  for (const key of ['units', 'mercenaries']) {
    if (Array.isArray(source[key]))
      result[key] = source[key].map((unit) => {
        const row = asRecord(unit);
        return {
          type: String(row.type ?? ''),
          level: Number(row.level ?? 0),
          quantity: Number(row.quantity ?? 0),
        };
      });
  }
  return result;
}

export function adminCombatDetails(value: unknown) {
  const stats = asRecord(value);
  const snapshots = asRecord(stats.adminSnapshots);
  const start = asRecord(stats.startOfAttack);
  const xp = asRecord(stats.xpEarned);
  const beforeAttacker: Record<string, unknown> = combatSnapshot(
    asRecord(snapshots.before).attacker ?? start.Attacker,
  );
  const beforeDefender: Record<string, unknown> = combatSnapshot(
    asRecord(snapshots.before).defender ?? start.Defender,
  );
  const afterAttacker: Record<string, unknown> = combatSnapshot(
    asRecord(snapshots.after).attacker,
  );
  const afterDefender: Record<string, unknown> = combatSnapshot(
    asRecord(snapshots.after).defender,
  );
  if (stats.forthpAtStart != null)
    beforeDefender.fortHitpoints = stats.forthpAtStart;
  if (stats.forthpAtEnd != null)
    afterDefender.fortHitpoints = stats.forthpAtEnd;
  if (stats.endTurns != null) afterAttacker.attackTurns = stats.endTurns;
  if (stats.attacker_units != null && !afterAttacker.units) {
    afterAttacker.units = parseArray(stats.attacker_units);
    afterAttacker.mercenaries = parseArray(stats.attacker_mercenaries);
  }
  if (stats.defender_units != null && !afterDefender.units) {
    afterDefender.units = parseArray(stats.defender_units);
    afterDefender.mercenaries = parseArray(stats.defender_mercenaries);
  }
  // Historical reports record XP gains, so the resulting XP is known.
  for (const [before, after, gain] of [
    [beforeAttacker, afterAttacker, xp.attacker],
    [beforeDefender, afterDefender, xp.defender],
  ] as const) {
    if (
      after.experience == null &&
      typeof before.experience === 'number' &&
      typeof gain === 'number'
    )
      after.experience = before.experience + gain;
  }
  const outcome: Record<string, unknown> = {};
  for (const key of [
    'turns',
    'pillagedGold',
    'attackerDamageDealt',
    'defenderDamageDealt',
    'attackerUnitDamageDealt',
    'attackerFortDamageDealt',
    'defenderUnitDamageDealt',
    'defensePointsAtEnd',
    'defender_protected',
    'fort_breached',
    'defender_daily_allowance_remaining',
    'defender_daily_gold_remaining',
  ]) {
    if (['string', 'number', 'boolean'].includes(typeof stats[key]))
      outcome[key] = stats[key];
  }
  const spy = asRecord(stats.spyResults);
  for (const key of [
    'success',
    'turns',
    'spiesSent',
    'spiesLost',
    'unitsKilled',
    'fortDmg',
    'intelPercentage',
    'successProbability',
  ]) {
    if (['string', 'number', 'boolean'].includes(typeof spy[key]))
      outcome[key] = spy[key];
  }
  return {
    completeSnapshots: snapshots.version === 1,
    before: { attacker: beforeAttacker, defender: beforeDefender },
    after: { attacker: afterAttacker, defender: afterDefender },
    outcome,
    losses: {
      attacker: asRecord(stats.attacker_losses),
      defender: asRecord(stats.defender_losses),
    },
    wounded: asRecord(stats.wounded),
  };
}

function parseArray(value: unknown): unknown[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed)
      ? parsed.map((unit) => {
          const row = asRecord(unit);
          return {
            type: String(row.type ?? ''),
            level: Number(row.level ?? 0),
            quantity: Number(row.quantity ?? 0),
          };
        })
      : [];
  } catch {
    return [];
  }
}
