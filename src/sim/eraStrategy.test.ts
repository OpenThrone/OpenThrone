import { describe, expect, it } from 'bun:test';

import { createEraPlayer } from './eraPopulation';
import {
  calculateItemCoverage,
  chooseCombatPosture,
  purchaseItemStockpile,
} from './eraStrategy';

describe('ERA player strategy', () => {
  it('retains durable offense and defense stockpiles across posture changes', () => {
    const player = createEraPlayer({
      id: 'stockpile-player',
      persona: 'attacker',
    });
    player.gold = 1_000_000;
    player.units.soldier = 10;
    player.units.guard = 10;

    const activePosture = chooseCombatPosture(player, 'attacker');
    expect(activePosture).toBe('active-raiding');
    expect(purchaseItemStockpile(player, activePosture)).toBeGreaterThan(0);
    const offenseStockpile = player.items.meleeAtk + player.items.rangedAtk;
    const defenseStockpile = player.items.meleeDef + player.items.rangedDef;
    expect(offenseStockpile).toBeGreaterThan(0);
    expect(defenseStockpile).toBeGreaterThan(0);
    expect(calculateItemCoverage(player)).toBeGreaterThan(0);

    player.attackTurns = 0;
    expect(chooseCombatPosture(player, 'attacker')).toBe('idle-defending');
    purchaseItemStockpile(player, 'idle-defending');
    expect(
      player.items.meleeAtk + player.items.rangedAtk,
    ).toBeGreaterThanOrEqual(offenseStockpile);
  });

  it('keeps farmers in an idle-defense posture even when they hold turns', () => {
    const player = createEraPlayer({
      id: 'farmer-posture',
      persona: 'farmer',
    });
    player.attackTurns = 10;

    expect(chooseCombatPosture(player, 'farmer')).toBe('idle-defending');
  });
});
