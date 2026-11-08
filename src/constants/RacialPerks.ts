/** Client-safe racial upgrade tuning. Tier zero has no effect. */
export const RACIAL_PERK_TIERS = [
  { fortLevel: 5, cost: 1_000_000, blocked: 0.2, recovered: 0.05, cap: 0.02 },
  { fortLevel: 9, cost: 4_000_000, blocked: 0.35, recovered: 0.07, cap: 0.02 },
  {
    fortLevel: 13,
    cost: 12_000_000,
    blocked: 0.5,
    recovered: 0.09,
    cap: 0.025,
  },
  {
    fortLevel: 17,
    cost: 30_000_000,
    blocked: 0.65,
    recovered: 0.12,
    cap: 0.03,
  },
] as const;

export function racialPerkTier(tier: number) {
  return Number.isInteger(tier) ? RACIAL_PERK_TIERS[tier - 1] : undefined;
}

const HUMAN_DESERTION_REMAINING = [100, 75, 60, 45, 30] as const;
const GOBLIN_CAPTURE_PERCENT = [0.1, 0.12, 0.14, 0.16, 0.18] as const;
const GOBLIN_CAPACITY_BONUS = [0, 0.25, 0.5, 0.75, 1] as const;
const GOBLIN_RANSOM_PERCENT = [50, 55, 60, 65, 70] as const;
const UNDEAD_DAILY_CAP = [0.02, 0.025, 0.03, 0.035, 0.04] as const;

const validTier = (tier: number): number =>
  Number.isInteger(tier) && tier >= 1 && tier <= 4 ? tier : 0;

export function racialFortRequirement(race: string, tier: number): number {
  const perk = racialPerkTier(tier);
  if (!perk) return 0;
  return race === 'GOBLIN' ? 11 + 2 * tier : perk.fortLevel;
}

export function disciplineDesertion(quantity: number, tier: number): number {
  return Math.floor(
    (quantity * HUMAN_DESERTION_REMAINING[validTier(tier)]) / 100,
  );
}

export function disciplineMoraleFloor(tier: number): number {
  return validTier(tier) * 5;
}

export function raidersCapturePercent(tier: number): number {
  return GOBLIN_CAPTURE_PERCENT[validTier(tier)];
}

export function raidersCapacity(base: number, tier: number): number {
  return Math.floor(base * (1 + GOBLIN_CAPACITY_BONUS[validTier(tier)]));
}

export function raidersRansomShare(total: bigint, tier: number): bigint {
  return (total * BigInt(GOBLIN_RANSOM_PERCENT[validTier(tier)])) / 100n;
}

export function necropolisBonus(tier: number): number {
  return validTier(tier) / 100;
}

export function necropolisDailyCap(army: number, tier: number): number {
  return Math.floor(
    Math.max(0, Math.floor(Number(army) || 0)) *
      UNDEAD_DAILY_CAP[validTier(tier)],
  );
}

/** Floor the blocked part of the already calculated own-dead pool. */
export function hallowedBlocked(ownPool: number, tier: number): number {
  const pool = Math.max(0, Math.floor(Number(ownPool) || 0));
  return Math.floor(pool * (racialPerkTier(tier)?.blocked ?? 0));
}

export function sanctuaryRecovery(fallen: number, tier: number): number {
  return Math.floor(
    Math.max(0, Math.floor(Number(fallen) || 0)) *
      (racialPerkTier(tier)?.recovered ?? 0),
  );
}

export function sanctuaryDailyCap(army: number, tier: number): number {
  return Math.floor(
    Math.max(0, Math.floor(Number(army) || 0)) *
      (racialPerkTier(tier)?.cap ?? 0),
  );
}
