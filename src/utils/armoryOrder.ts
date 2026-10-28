import type { Item } from '@/types/typings';

export type ArmoryItem = Item & {
  ownedItems: number;
  enabled: boolean;
  conversionValue?: number;
  /** Price before any armory discount event; sell refunds are based on it. */
  refundBaseCost?: number;
};
export type ArmoryQuantities = Record<string, number>;

export const armoryCategoryKeys: Record<string, string> = {
  WEAPON: 'weapons',
  HELM: 'helmets',
  BRACERS: 'bracers',
  SHIELD: 'shields',
  BOOTS: 'boots',
  ARMOR: 'armor',
};

export const armoryOrderCost = (
  items: ArmoryItem[],
  quantities: ArmoryQuantities,
) =>
  items.reduce(
    (cost, item) => cost + item.cost * (quantities[item.id] || 0),
    0,
  );

/** Inventory is stored by tier, even when several named items share that tier. */
export const ownedSlotCoverage = (item: ArmoryItem, items: ArmoryItem[]) => {
  const tiers = new Map<number, number>();
  items
    .filter(
      (candidate) =>
        candidate.type === item.type && candidate.usage === item.usage,
    )
    .forEach((candidate) =>
      tiers.set(
        candidate.level,
        Math.max(tiers.get(candidate.level) ?? 0, candidate.ownedItems),
      ),
    );
  return Array.from(tiers.values()).reduce((total, owned) => total + owned, 0);
};

/** Count per tier (item level or unit level). Missing tiers count as zero. */
export type ArmoryTierCounts = Record<number, number>;

/** Units held per level for one usage, e.g. every OFFENSE unit tier. */
export const armoryUnitTiers = (
  units: ReadonlyArray<{ type: string; level: number; quantity: number }>,
  usage: string,
): ArmoryTierCounts => {
  const tiers: ArmoryTierCounts = {};
  units.forEach((unit) => {
    if (unit.type === usage)
      tiers[unit.level] = (tiers[unit.level] ?? 0) + unit.quantity;
  });
  return tiers;
};

/** Stock per item tier: the largest owned count in the tier plus any quantities already in the order. */
const stockByTier = (
  items: ArmoryItem[],
  quantities: ArmoryQuantities = {},
): ArmoryTierCounts => {
  const owned: ArmoryTierCounts = {};
  const ordered: ArmoryTierCounts = {};
  items.forEach((item) => {
    owned[item.level] = Math.max(owned[item.level] ?? 0, item.ownedItems);
    ordered[item.level] =
      (ordered[item.level] ?? 0) + (quantities[item.id] || 0);
  });
  const stock: ArmoryTierCounts = {};
  Object.keys(owned).forEach((key) => {
    const tier = Number(key);
    stock[tier] = (owned[tier] ?? 0) + (ordered[tier] ?? 0);
  });
  return stock;
};

export interface ArmoryTierCoverage {
  /** Units that hold an item from this stock. */
  covered: number;
  units: number;
  coveredByTier: ArmoryTierCounts;
}

/**
 * Units wear items at their level or below. Process tiers from low to high: each
 * tier's stock joins the pool, then that tier's units draw from it. Nested tier
 * sets make this greedy a maximum match. Only tiers at or above `minTier` count.
 */
export const armoryTierCoverage = (
  stock: ArmoryTierCounts,
  unitTiers: ArmoryTierCounts,
  minTier = 0,
): ArmoryTierCoverage => {
  const tiers = [
    ...new Set([...Object.keys(stock), ...Object.keys(unitTiers)].map(Number)),
  ]
    .filter((tier) => tier >= minTier)
    .sort((a, b) => a - b);
  let pool = 0;
  let covered = 0;
  let units = 0;
  const coveredByTier: ArmoryTierCounts = {};
  tiers.forEach((tier) => {
    pool += stock[tier] ?? 0;
    const count = unitTiers[tier] ?? 0;
    const taken = Math.min(count, pool);
    pool -= taken;
    covered += taken;
    units += count;
    coveredByTier[tier] = taken;
  });
  return { covered, units, coveredByTier };
};

/** Units no current stock covers. New items of `tier` can reach only these. */
const openUnitsForTier = (
  stock: ArmoryTierCounts,
  unitTiers: ArmoryTierCounts,
  tier: number,
) => {
  const { coveredByTier } = armoryTierCoverage(stock, unitTiers);
  return Object.entries(unitTiers).reduce(
    (open, [unitTier, count]) =>
      Number(unitTier) >= tier
        ? open + count - (coveredByTier[Number(unitTier)] ?? 0)
        : open,
    0,
  );
};

export interface ArmorySlotReadiness {
  /** Units that have a slot item they can wear. */
  covered: number;
  units: number;
  /** Units still without a usable slot item; zero once the slot is fully equipped. */
  missing: number;
  complete: boolean;
  coveredByTier: ArmoryTierCounts;
}

/** Equipment readiness of one slot, tier by tier. `slotItems` lists every tier of the slot. */
export const armorySlotReadiness = (
  slotItems: ArmoryItem[],
  unitTiers: ArmoryTierCounts,
): ArmorySlotReadiness => {
  const coverage = armoryTierCoverage(stockByTier(slotItems), unitTiers);
  const missing = Math.max(0, coverage.units - coverage.covered);
  return {
    covered: coverage.covered,
    units: coverage.units,
    missing,
    complete: coverage.units > 0 && missing === 0,
    coveredByTier: coverage.coveredByTier,
  };
};

export interface ArmoryUpgradeHint {
  tier: number;
  /** Units at or above this tier that lack gear of this tier or better. */
  fits: number;
}

/** Highest unlocked tier that fits units still without gear of that tier or better. */
export const armoryUpgradeHint = (
  slotItems: ArmoryItem[],
  unitTiers: ArmoryTierCounts,
): ArmoryUpgradeHint | null => {
  const stock = stockByTier(slotItems);
  const tiers = [
    ...new Set(
      slotItems.filter((item) => item.enabled).map((item) => item.level),
    ),
  ].sort((a, b) => b - a);
  for (const tier of tiers) {
    const coverage = armoryTierCoverage(stock, unitTiers, tier);
    const fits = coverage.units - coverage.covered;
    if (fits > 0) return { tier, fits };
  }
  return null;
};

/** Fill only units no current stock covers; reserve gold and coverage already in the order. */
export const maxArmoryQuantity = (
  item: ArmoryItem,
  items: ArmoryItem[],
  quantities: ArmoryQuantities,
  unitTiers: ArmoryTierCounts,
  gold: bigint,
): number => {
  if (!item.enabled) return 0;
  const otherQuantities = { ...quantities, [item.id]: 0 };
  const slotItems = items.filter(
    (candidate) =>
      candidate.type === item.type && candidate.usage === item.usage,
  );
  const needed = openUnitsForTier(
    stockByTier(slotItems, otherQuantities),
    unitTiers,
    item.level,
  );
  const remaining = gold - BigInt(armoryOrderCost(items, otherQuantities));
  if (remaining < 0n) return 0;
  return item.cost > 0
    ? Math.min(needed, Number(remaining / BigInt(item.cost)))
    : needed;
};

/** Raise coverage evenly across selected slots. Each slot buys only the tier it selected. */
export const planArmoryLoadout = (
  selected: ArmoryItem[],
  items: ArmoryItem[],
  quantities: ArmoryQuantities,
  unitTiers: ArmoryTierCounts,
  gold: bigint,
) => {
  const next = { ...quantities };
  const selectedSlots = new Set(
    selected.map((item) => `${item.usage}_${item.type}`),
  );
  items.forEach((item) => {
    if (selectedSlots.has(`${item.usage}_${item.type}`)) delete next[item.id];
  });
  const reserved = BigInt(armoryOrderCost(items, next));
  const budget = gold > reserved ? gold - reserved : 0n;
  const totalUnits = Object.values(unitTiers).reduce(
    (total, count) => total + count,
    0,
  );
  const slots = selected.map((item) => {
    const stock = stockByTier(
      items.filter(
        (candidate) =>
          candidate.type === item.type && candidate.usage === item.usage,
      ),
    );
    return {
      item,
      covered: armoryTierCoverage(stock, unitTiers).covered,
      open: openUnitsForTier(stock, unitTiers, item.level),
    };
  });
  const boughtAt = (target: number, slot: (typeof slots)[number]) =>
    Math.max(0, Math.min(target - slot.covered, slot.open));
  const costAt = (target: number) =>
    slots.reduce(
      (cost, slot) =>
        cost + BigInt(boughtAt(target, slot)) * BigInt(slot.item.cost),
      0n,
    );
  let low = 0;
  let high = totalUnits;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (costAt(middle) <= budget) low = middle;
    else high = middle - 1;
  }
  slots.forEach((slot) => {
    next[slot.item.id] = boughtAt(low, slot);
  });
  const coverage = slots.length
    ? Math.min(...slots.map((slot) => slot.covered + boughtAt(low, slot)))
    : 0;
  return { quantities: next, coverage, cost: Number(costAt(low)) };
};

export interface ArmoryUpgradeConversion {
  fromItem: string;
  toItem: string;
  conversionAmount: number;
  fromName: string;
  toName: string;
  cost: number;
  refund: number;
}

/** Upgrade existing lower tiers only; leave empty slots and stronger gear untouched. */
export const planArmoryUpgrades = (
  selected: ArmoryItem[],
  items: ArmoryItem[],
  quantities: ArmoryQuantities,
  units: number,
  gold: bigint,
) => {
  const reserved = BigInt(armoryOrderCost(items, quantities));
  const budget = gold > reserved ? gold - reserved : 0n;
  const slots = selected
    .filter((item) => item.enabled)
    .map((target) => {
      const sameSlot = items.filter(
        (item) => item.type === target.type && item.usage === target.usage,
      );
      const tiers = new Map<number, ArmoryItem>();
      sameSlot
        .filter((item) => item.level < target.level && item.ownedItems > 0)
        .forEach((item) => {
          if (!tiers.has(item.level)) tiers.set(item.level, item);
        });
      return {
        target,
        covered: ownedSlotCoverage(
          target,
          sameSlot.filter((item) => item.level >= target.level),
        ),
        sources: Array.from(tiers.values()).sort((a, b) => b.level - a.level),
      };
    });
  const atCoverage = (coverage: number) => {
    const conversions: ArmoryUpgradeConversion[] = [];
    for (const { target, covered, sources } of slots) {
      let needed = Math.max(0, Math.min(coverage, units) - covered);
      for (const source of sources) {
        const amount = Math.min(needed, source.ownedItems);
        if (amount <= 0) continue;
        const difference =
          target.cost - (source.conversionValue ?? source.cost);
        conversions.push({
          fromItem: source.id,
          toItem: target.id,
          conversionAmount: amount,
          fromName: source.name,
          toName: target.name,
          cost: Math.max(0, difference) * amount,
          refund: difference < 0 ? Math.floor(-difference * amount * 0.75) : 0,
        });
        needed -= amount;
      }
    }
    return conversions;
  };
  let low = 0;
  let high = slots.length ? units : 0;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const cost = atCoverage(middle).reduce(
      (sum, conversion) => sum + BigInt(conversion.cost),
      0n,
    );
    if (cost <= budget) low = middle;
    else high = middle - 1;
  }
  const conversions = atCoverage(low);
  return {
    conversions,
    coverage: slots.length
      ? Math.min(
          units,
          ...slots.map(
            ({ target, covered }) =>
              covered +
              conversions
                .filter((conversion) => conversion.toItem === target.id)
                .reduce(
                  (sum, conversion) => sum + conversion.conversionAmount,
                  0,
                ),
          ),
        )
      : 0,
    cost: conversions.reduce((sum, conversion) => sum + conversion.cost, 0),
    refund: conversions.reduce((sum, conversion) => sum + conversion.refund, 0),
    count: conversions.reduce(
      (sum, conversion) => sum + conversion.conversionAmount,
      0,
    ),
  };
};
