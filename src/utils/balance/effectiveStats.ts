import type { RandomFn } from '@/utils/random';

export type CombatStatsLike = {
  MeleeAtkPower?: number;
  MeleeDefPower?: number;
  RangedAtkPower?: number;
  RangedDefPower?: number;
};

export function totalCombatPower(stats: CombatStatsLike): number {
  return (
    Number(stats?.MeleeAtkPower || 0) +
    Number(stats?.MeleeDefPower || 0) +
    Number(stats?.RangedAtkPower || 0) +
    Number(stats?.RangedDefPower || 0)
  );
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function computeBattleWinProbabilityProxy(
  attackerPower: number,
  defenderPower: number,
): number {
  const ratio = attackerPower / Math.max(1, defenderPower);
  const logRatio = Math.log(Math.max(0.01, ratio));
  return Number(sigmoid(4 * logRatio).toFixed(4));
}

export function computeSpySuccessProbability(params: {
  attackerSpy: number;
  defenderSentry: number;
  k?: number;
  situationalModifier?: number;
}): number {
  const attackerSpy = Math.max(0, Number(params.attackerSpy || 0));
  const defenderSentry = Math.max(1, Number(params.defenderSentry || 1));
  const ratio = attackerSpy / defenderSentry;

  // Keep hard guardrails for extreme mismatches.
  if (ratio <= 0.25) return 0.01;
  if (ratio >= 4) return 0.99;

  const k = Number.isFinite(params.k as number) ? Number(params.k) : 2.4;
  const modifier = Number(params.situationalModifier || 0);
  const x = k * Math.log(Math.max(0.01, ratio)) + modifier;
  const p = sigmoid(x);
  return Math.max(0.01, Math.min(0.99, p));
}

export function resolveSpyMissionSuccess(params: {
  attackerSpy: number;
  defenderSentry: number;
  random?: RandomFn;
  k?: number;
  situationalModifier?: number;
}) {
  const probability = computeSpySuccessProbability({
    attackerSpy: params.attackerSpy,
    defenderSentry: params.defenderSentry,
    k: params.k,
    situationalModifier: params.situationalModifier,
  });
  const random = params.random ?? Math.random;
  const success = random() < probability;
  return {
    success,
    probability: Number(probability.toFixed(4)),
  };
}

export function isBalanceV2Enabled(): boolean {
  return process.env.OT_ENABLE_BALANCE_V2 === 'true';
}

function parseRolloutPercent(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

function toRolloutBucket(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 10000;
  }
  return hash % 100;
}

export function isBalanceV2EnabledForUser(userId?: number | string): boolean {
  const globalToggle = process.env.OT_ENABLE_BALANCE_V2;
  if (globalToggle === 'true') return true;
  if (globalToggle === 'false') return false;

  const rolloutPercent = parseRolloutPercent(
    process.env.OT_BALANCE_V2_ROLLOUT_PERCENT,
  );
  if (rolloutPercent <= 0) return false;
  if (rolloutPercent >= 100) return true;

  if (userId === undefined || userId === null) return false;
  return toRolloutBucket(String(userId)) < rolloutPercent;
}
