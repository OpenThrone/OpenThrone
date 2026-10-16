import { ItemTypes } from '@/constants/Items';
import type { Item } from '@/types/typings';

export const discountedItemCost = (cost: number, priceBonus: number): number =>
  cost - Math.ceil((priceBonus / 100) * cost);

/** Shared inventory tiers are credited at their cheapest definition, including race aliases. */
export const slotFloorCost = (
  item: Pick<Item, 'usage' | 'type' | 'level' | 'cost'>,
): number =>
  Math.min(
    ...ItemTypes.filter(
      (candidate) =>
        candidate.usage === item.usage &&
        candidate.type === item.type &&
        candidate.level === item.level,
    ).map((candidate) => candidate.cost),
  );
