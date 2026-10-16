import type { Item } from '@/types/typings';

export type ArmoryItem = Item & {
  ownedItems: number;
  enabled: boolean;
  conversionValue?: number;
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

/** Fill only uncovered slots; reserve gold and coverage already in the order. */
export const maxArmoryQuantity = (
  item: ArmoryItem,
  items: ArmoryItem[],
  quantities: ArmoryQuantities,
  units: number,
  gold: bigint,
): number => {
  if (!item.enabled) return 0;
  const otherQuantities = { ...quantities, [item.id]: 0 };
  const covered =
    ownedSlotCoverage(item, items) +
    items
      .filter(
        (candidate) =>
          candidate.type === item.type && candidate.usage === item.usage,
      )
      .reduce(
        (total, candidate) => total + (otherQuantities[candidate.id] || 0),
        0,
      );
  const needed = Math.max(0, units - covered);
  const remaining = gold - BigInt(armoryOrderCost(items, otherQuantities));
  if (remaining < 0n) return 0;
  return item.cost > 0
    ? Math.min(needed, Number(remaining / BigInt(item.cost)))
    : needed;
};

/** Raise coverage evenly across selected slots, with no implicit tier upgrades. */
export const planArmoryLoadout = (
  selected: ArmoryItem[],
  items: ArmoryItem[],
  quantities: ArmoryQuantities,
  units: number,
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
  const slots = selected.map((item) => ({
    item,
    owned: ownedSlotCoverage(item, items),
  }));
  const costAt = (target: number) =>
    slots.reduce(
      (cost, { item, owned }) =>
        cost + BigInt(Math.max(0, target - owned)) * BigInt(item.cost),
      0n,
    );
  let low = 0;
  let high = units;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (costAt(middle) <= budget) low = middle;
    else high = middle - 1;
  }
  slots.forEach(({ item, owned }) => {
    next[item.id] = Math.max(0, low - owned);
  });
  return { quantities: next, coverage: low, cost: Number(costAt(low)) };
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
