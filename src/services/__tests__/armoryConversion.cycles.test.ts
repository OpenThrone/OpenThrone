import { describe, expect, it } from 'bun:test';

import { ItemTypes } from '@/constants';
import { quoteItemConversion } from '@/services/Armory.service';
import type { Item } from '@/types/typings';

// Brute-forces every 2- and 3-step conversion cycle over the real item table.
// Inventory rows are keyed by usage/type/level, so after converting into item X the player
// may name any item sharing X's slot as the next source; the search covers those aliases too.

const RACES = ['HUMAN', 'ELF', 'UNDEAD', 'GOBLIN'];
const PRICE_BONUSES = [0, 5, 17, 33];
const AMOUNTS = [1, 7];
const MAX_ARMORY_LEVEL = Math.max(...ItemTypes.map((i) => i.armoryLevel ?? 1));

const slotKey = (item: Item) => `${item.usage}|${item.type}|${item.level}`;
const slotAliases = new Map<string, Item[]>();
for (const item of ItemTypes) {
  const key = slotKey(item);
  slotAliases.set(key, [...(slotAliases.get(key) ?? []), item]);
}

/** Net gold of one conversion, or null when the service would reject it. */
const step = (
  from: Item,
  to: Item,
  amount: number,
  priceBonus: number,
  race: string,
): number | null => {
  try {
    const { cost, refund } = quoteItemConversion({
      from,
      to,
      amount,
      priceBonus,
      race,
      armoryLevel: MAX_ARMORY_LEVEL,
    });
    expect(cost === 0 || refund === 0).toBe(true);
    return refund - cost;
  } catch (error: any) {
    expect(error.message).toStartWith('Cannot convert');
    return null;
  }
};

/** Best (largest) net gold for converting out of `fromSlotItem`'s slot into `to`. */
const bestStep = (
  fromSlotItem: Item,
  to: Item,
  amount: number,
  priceBonus: number,
  race: string,
): number | null => {
  let best: number | null = null;
  for (const alias of slotAliases.get(slotKey(fromSlotItem)) ?? []) {
    const net = step(alias, to, amount, priceBonus, race);
    if (net !== null && (best === null || net > best)) best = net;
  }
  return best;
};

describe('armory conversion cycles never mint gold', () => {
  for (const race of RACES) {
    for (const priceBonus of PRICE_BONUSES) {
      for (const amount of AMOUNTS) {
        it(`race ${race}, price bonus ${priceBonus}%, amount ${amount}`, () => {
          let validTwoCycles = 0;
          let validThreeCycles = 0;
          let bestNet = -Infinity;

          for (const a of ItemTypes) {
            for (const b of ItemTypes) {
              const ab = bestStep(a, b, amount, priceBonus, race);
              if (ab === null) continue;

              const ba = bestStep(b, a, amount, priceBonus, race);
              if (ba !== null) {
                validTwoCycles++;
                bestNet = Math.max(bestNet, ab + ba);
                expect(ab + ba).toBeLessThanOrEqual(0);
              }

              for (const c of ItemTypes) {
                const bc = bestStep(b, c, amount, priceBonus, race);
                if (bc === null) continue;
                const ca = bestStep(c, a, amount, priceBonus, race);
                if (ca === null) continue;
                validThreeCycles++;
                bestNet = Math.max(bestNet, ab + bc + ca);
                expect(ab + bc + ca).toBeLessThanOrEqual(0);
              }
            }
          }

          // Guard against a vacuous pass: real cycles must exist and be explored
          expect(validTwoCycles).toBeGreaterThan(100);
          expect(validThreeCycles).toBeGreaterThan(100);
          expect(bestNet).toBeLessThanOrEqual(0);
        });
      }
    }
  }

  it('rejects every cross-category pair', () => {
    for (const a of ItemTypes) {
      for (const b of ItemTypes) {
        if (a.usage === b.usage && a.type === b.type) continue;
        expect(step(a, b, 1, 0, 'HUMAN')).toBeNull();
      }
    }
  });

  it('rejects the reported cross-type chain at its first step', () => {
    const dagger = ItemTypes.find((i) => i.id === 'OFFENSE_DAGGER')!;
    const hood = ItemTypes.find(
      (i) => i.id === 'OFFENSE_STUDDED-LEATHER-HOOD',
    )!;
    expect(step(dagger, hood, 1, 0, 'HUMAN')).toBeNull();
  });
});
