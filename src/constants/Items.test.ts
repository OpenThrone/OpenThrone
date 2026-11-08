import { describe, expect, it } from 'bun:test';

import { ItemTypes } from '@/constants/Items';
import { ArmoryUpgrades } from '@/constants/Structure_Upgrades';

describe('item catalog', () => {
  it('only asks for Armory levels a player can reach', () => {
    const topArmory = Math.max(...ArmoryUpgrades.map(({ level }) => level));
    const unreachable = ItemTypes.filter(
      (item) => (item.armoryLevel ?? 1) > topArmory,
    );
    expect(unreachable.map(({ name }) => name)).toEqual([]);
  });
});
