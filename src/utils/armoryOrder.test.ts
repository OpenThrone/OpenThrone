import { describe, expect, it } from 'bun:test';

import type { ArmoryItem } from '@/utils/armoryOrder';
import {
  armoryOrderCost,
  armorySlotReadiness,
  armoryUpgradeHint,
  maxArmoryQuantity,
  planArmoryLoadout,
  planArmoryUpgrades,
} from '@/utils/armoryOrder';

const item = (
  id: string,
  type: ArmoryItem['type'],
  cost: number,
  ownedItems = 0,
  usage = 'OFFENSE',
): ArmoryItem => ({
  id,
  type,
  cost,
  ownedItems,
  usage,
  name: id,
  level: 1,
  bonus: 1,
  race: 'ALL',
  armoryLevel: 1,
  enabled: true,
});

describe('Armory purchase planning', () => {
  it('caps Max at units the item tier can wear, net of stock and pending purchases', () => {
    const dagger = item('dagger', 'WEAPON', 10, 20);
    const sword = { ...item('sword', 'WEAPON', 20, 30), level: 2 };
    expect(
      maxArmoryQuantity(
        dagger,
        [dagger, sword],
        { sword: 10, dagger: 5 },
        { 1: 100 },
        5000n,
      ),
    ).toBe(80);
    // Level 2 stock covers Level 2 units; only the dagger's remaining gap is open.
    expect(
      maxArmoryQuantity(
        dagger,
        [dagger, sword],
        { sword: 10, dagger: 5 },
        { 2: 100 },
        5000n,
      ),
    ).toBe(40);
  });
  it('counts shared inventory tiers once when named gear overlaps', () => {
    const dagger = item('dagger', 'WEAPON', 10, 30);
    const sword = item('sword', 'WEAPON', 20, 30);
    expect(
      maxArmoryQuantity(dagger, [dagger, sword], {}, { 1: 50 }, 1000n),
    ).toBe(20);
    expect(
      planArmoryLoadout([dagger], [dagger, sword], {}, { 1: 50 }, 1000n)
        .quantities.dagger,
    ).toBe(20);
  });
  it('reserves gold across slots and tabs, excluding the row being replaced', () => {
    const dagger = item('dagger', 'WEAPON', 10);
    const shield = item('shield', 'SHIELD', 20, 0, 'DEFENSE');
    expect(
      maxArmoryQuantity(
        dagger,
        [dagger, shield],
        { shield: 3, dagger: 2 },
        { 1: 100 },
        100n,
      ),
    ).toBe(4);
    expect(
      maxArmoryQuantity(
        dagger,
        [dagger, shield],
        { shield: 10 },
        { 1: 100 },
        100n,
      ),
    ).toBe(0);
  });
  it('handles zero units, surplus gear, free gear, and locked gear', () => {
    const dagger = item('dagger', 'WEAPON', 0, 5);
    expect(maxArmoryQuantity(dagger, [dagger], {}, { 1: 10 }, 0n)).toBe(5);
    expect(maxArmoryQuantity(dagger, [dagger], {}, {}, 0n)).toBe(0);
    expect(
      maxArmoryQuantity(
        { ...dagger, enabled: false },
        [dagger],
        {},
        { 1: 10 },
        10n,
      ),
    ).toBe(0);
  });
  it('prepares balanced coverage with partial gold and existing inventory', () => {
    const dagger = item('dagger', 'WEAPON', 10, 5);
    const shield = item('shield', 'SHIELD', 20);
    const plan = planArmoryLoadout(
      [dagger, shield],
      [dagger, shield],
      {},
      { 1: 10 },
      140n,
    );
    expect(plan.coverage).toBe(6);
    expect(plan.quantities).toEqual({ dagger: 1, shield: 6 });
    expect(plan.cost).toBe(130);
  });
  it('replaces selected slots only and preserves gold reserved for others', () => {
    const dagger = item('dagger', 'WEAPON', 10);
    const sword = item('sword', 'WEAPON', 20);
    const shield = item('shield', 'SHIELD', 20);
    const plan = planArmoryLoadout(
      [dagger],
      [dagger, sword, shield],
      { sword: 4, shield: 2 },
      { 1: 10 },
      100n,
    );
    expect(plan.quantities).toEqual({ dagger: 6, shield: 2 });
    expect(armoryOrderCost([dagger, sword, shield], plan.quantities)).toBe(100);
  });
  it('fills every selected slot without buying surplus when fully affordable', () => {
    const dagger = item('dagger', 'WEAPON', 10, 15);
    const shield = item('shield', 'SHIELD', 20, 2);
    expect(
      planArmoryLoadout(
        [dagger, shield],
        [dagger, shield],
        {},
        { 1: 10 },
        1000n,
      ).quantities,
    ).toEqual({ dagger: 0, shield: 8 });
  });
});

describe('Armory upgrade planning', () => {
  it('converts lower tiers at the difference without buying new items', () => {
    const dagger = item('dagger', 'WEAPON', 10, 20);
    const sword = { ...item('sword', 'WEAPON', 25, 5), level: 2 };
    const plan = planArmoryUpgrades([sword], [dagger, sword], {}, 30, 1000n);
    expect(plan.count).toBe(20);
    expect(plan.cost).toBe(300);
    expect(plan.coverage).toBe(25);
    expect(plan.conversions[0]).toMatchObject({
      fromItem: 'dagger',
      toItem: 'sword',
      conversionAmount: 20,
    });
  });
  it('reserves pending purchases and caps upgrades at owned unit coverage', () => {
    const dagger = item('dagger', 'WEAPON', 10, 100);
    const sword = { ...item('sword', 'WEAPON', 20, 5), level: 2 };
    const shield = item('shield', 'SHIELD', 20);
    expect(
      planArmoryUpgrades(
        [sword],
        [dagger, sword, shield],
        { shield: 3 },
        10,
        100n,
      ).count,
    ).toBe(4);
    expect(
      planArmoryUpgrades([sword], [dagger, sword], {}, 10, 1000n).count,
    ).toBe(5);
  });
  it('preserves stronger equipment and uses shared tier credit exactly once', () => {
    const dagger = item('dagger', 'WEAPON', 10, 20);
    const alias = { ...item('alias', 'WEAPON', 15, 20), conversionValue: 10 };
    const sword = { ...item('sword', 'WEAPON', 25, 0), level: 2 };
    const better = { ...item('better', 'WEAPON', 40, 8), level: 3 };
    const plan = planArmoryUpgrades(
      [sword],
      [alias, dagger, sword, better],
      {},
      10,
      1000n,
    );
    expect(plan.count).toBe(2);
    expect(plan.cost).toBe(30);
    expect(plan.conversions).toHaveLength(1);
  });
  it('continues other slots after one slot runs out of lower-tier gear', () => {
    const dagger = item('dagger', 'WEAPON', 10, 10);
    const sword = { ...item('sword', 'WEAPON', 20), level: 2 };
    const hood = item('hood', 'HELM', 5, 2);
    const helmet = { ...item('helmet', 'HELM', 10), level: 2 };
    const plan = planArmoryUpgrades(
      [sword, helmet],
      [dagger, sword, hood, helmet],
      {},
      10,
      1000n,
    );
    expect(plan.count).toBe(12);
    expect(plan.cost).toBe(110);
  });
  it('balances affordable coverage across slots and excludes locked targets', () => {
    const dagger = item('dagger', 'WEAPON', 10, 10);
    const sword = { ...item('sword', 'WEAPON', 20), level: 2 };
    const hood = item('hood', 'HELM', 5, 10);
    const helmet = { ...item('helmet', 'HELM', 10), level: 2 };
    const plan = planArmoryUpgrades(
      [sword, helmet],
      [dagger, sword, hood, helmet],
      {},
      10,
      46n,
    );
    expect(plan.coverage).toBe(3);
    expect(plan.cost).toBe(45);
    expect(
      plan.conversions.map((conversion) => conversion.conversionAmount),
    ).toEqual([3, 3]);
    expect(
      planArmoryUpgrades(
        [{ ...sword, enabled: false }],
        [dagger, sword],
        {},
        10,
        100n,
      ).count,
    ).toBe(0);
  });
  it('counts a unit only with gear at its own level or below', () => {
    const dagger = item('dagger', 'WEAPON', 10, 6);
    const sword = { ...item('sword', 'WEAPON', 20, 4), level: 2 };
    const ready = armorySlotReadiness([dagger, sword], { 1: 4, 2: 6 });
    expect(ready).toMatchObject({
      covered: 10,
      units: 10,
      missing: 0,
      complete: true,
    });
    expect(ready.coveredByTier).toEqual({ 1: 4, 2: 6 });
    const highTierOnly = { ...sword, ownedItems: 6, level: 3 };
    const mismatch = armorySlotReadiness([highTierOnly], { 1: 4, 3: 2 });
    expect(mismatch).toMatchObject({
      covered: 2,
      units: 6,
      missing: 4,
      complete: false,
    });
    expect(mismatch.coveredByTier).toEqual({ 1: 0, 3: 2 });
    expect(armorySlotReadiness([dagger], { 1: 0 }).complete).toBe(false);
    expect(armorySlotReadiness([], { 1: 5 }).missing).toBe(5);
  });
  it('suggests the highest unlocked tier that fits units without it', () => {
    const dagger = item('dagger', 'WEAPON', 10, 0);
    const hatchet = { ...item('hatchet', 'WEAPON', 20, 0), level: 2 };
    const quarterstaff = { ...item('quarterstaff', 'WEAPON', 30, 5), level: 3 };
    const slot = [dagger, hatchet, quarterstaff];
    expect(armoryUpgradeHint(slot, { 1: 3, 2: 4, 3: 2 })).toEqual({
      tier: 2,
      fits: 4,
    });
    expect(armoryUpgradeHint(slot, { 1: 3, 2: 4, 3: 8 })).toEqual({
      tier: 3,
      fits: 3,
    });
    expect(armoryUpgradeHint([dagger], { 1: 0 })).toBeNull();
  });
  it('never offers tiers no unit can wear', () => {
    const mace = { ...item('mace', 'WEAPON', 40, 0), level: 4 };
    expect(armoryUpgradeHint([mace], { 1: 5, 2: 5, 3: 5 })).toBeNull();
  });
});
