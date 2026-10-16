import { type RandomFn, requireRandom } from '@/utils/random';

/** Defines the combat stats like shape used by related workflows. */
export type CombatStatsLike = {
  MeleeAtkPower?: number;
  MeleeDefPower?: number;
  RangedAtkPower?: number;
  RangedDefPower?: number;
};

/** Total combat power. */
export function totalCombatPower(stats: CombatStatsLike): number {
  return (
    Number(stats?.MeleeAtkPower || 0) +
    Number(stats?.MeleeDefPower || 0) +
    Number(stats?.RangedAtkPower || 0) +
    Number(stats?.RangedDefPower || 0)
  );
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Compute battle win probability proxy. */
export function computeBattleWinProbabilityProxy(
  attackerPower: number,
  defenderPower: number,
): number {
  const ratio = attackerPower / Math.max(1, defenderPower);
  const logRatio = Math.log(Math.max(0.01, ratio));
  return Number(sigmoid(4 * logRatio).toFixed(4));
}

/** Spy odds = exp(modifier) * ratio^2.4. Clamp the continuous curve, not ratios. */
export function computeSpySuccessProbability(params: {
  attackerSpy: number;
  defenderSentry: number;
  situationalModifier?: number;
}): number {
  const attackerSpy = Number.isFinite(params.attackerSpy)
    ? Math.max(0, params.attackerSpy)
    : 0;
  if (attackerSpy === 0) return 0;
  const defenderSentry = Number.isFinite(params.defenderSentry)
    ? Math.max(1, params.defenderSentry)
    : 1;
  const modifier = Number.isFinite(params.situationalModifier)
    ? params.situationalModifier!
    : 0;
  return Math.max(
    0.01,
    Math.min(
      0.99,
      sigmoid(2.4 * Math.log(attackerSpy / defenderSentry) + modifier),
    ),
  );
}

/** A single injected roll resolves every spy mission's sentry entry check. */
export function resolveSpyMissionSuccess(params: {
  attackerSpy: number;
  defenderSentry: number;
  random: RandomFn;
  situationalModifier?: number;
}) {
  const random = requireRandom(params.random);
  const probability = computeSpySuccessProbability(params);
  return {
    success: probability > 0 && random() < probability,
    probability,
  };
}
