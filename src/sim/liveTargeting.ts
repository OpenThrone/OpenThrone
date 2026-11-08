/**
 * How a live-rules player sizes up a target. The legacy targeting reads the
 * target's true army through a rough power formula that ignores items,
 * bonuses and the fort. A live player knows their own army exactly, sees a
 * target's population and fort on the attack list, and only knows the
 * target's defense after a successful spy report.
 */
import { Fortifications } from '../constants';
import type { UnitType } from '../types/typings';
import { calculateCombatStrength } from '../utils/combatStrength';
import { UNIT_MAPPING } from './engine';
import { mercenaryRoster } from './liveForces';
import type { PlayerState } from './types';

/** Battle strength the attacker brings and the defense it expects to meet. */
export interface LivePowerEstimator {
  attacker: number;
  target: (target: PlayerState, hasIntel: boolean) => number;
}

/** The player's total attack (OFFENSE) or defense (DEFENSE), as the battle code computes it. */
export function liveCombatPower(
  player: PlayerState,
  role: 'OFFENSE' | 'DEFENSE',
): number {
  const strength = calculateCombatStrength(
    {
      units: UNIT_MAPPING.filter(({ key }) => player.units[key] > 0).map(
        ({ key, type, level }) => ({
          type: type as UnitType,
          level,
          quantity: player.units[key],
        }),
      ),
      mercenaries: mercenaryRoster(player),
      items: player.inventory ?? [],
      battle_upgrades: player.battleUpgrades ?? [],
      structure_upgrades: [
        { type: 'ARMORY', level: player.armoryLevel ?? 1 },
        { type: 'OFFENSE', level: player.offenseStructureLevel ?? 1 },
      ],
      fortLevel: player.fortLevel,
      race: player.race,
      attackBonus: player.bonuses.attack,
      defenseBonus: player.bonuses.defense,
    },
    role,
  ).totalStats;
  return role === 'OFFENSE'
    ? strength.MeleeAtkPower + strength.RangedAtkPower
    : strength.MeleeDefPower + strength.RangedDefPower;
}

function population(player: PlayerState): number {
  return Object.values(player.units).reduce((sum, count) => sum + count, 0);
}

function fortDefense(player: PlayerState): number {
  return (
    Fortifications.find((fort) => fort.level === player.fortLevel)
      ?.defenseBonusPercentage ?? 0
  );
}

/**
 * The estimator for one attacker. With fresh intel the target's real
 * defense is used; without it, the attacker scales its own defense by the
 * target's visible population and fort.
 */
export function createLivePowerEstimator(
  attacker: PlayerState,
  defenseCache: Map<string, number>,
): LivePowerEstimator {
  const defenseOf = (player: PlayerState) => {
    let value = defenseCache.get(player.id);
    if (value === undefined) {
      value = liveCombatPower(player, 'DEFENSE');
      defenseCache.set(player.id, value);
    }
    return value;
  };
  return {
    attacker: liveCombatPower(attacker, 'OFFENSE'),
    target: (target, hasIntel) => {
      if (hasIntel) return defenseOf(target);
      const ownDefense = defenseOf(attacker);
      return (
        ownDefense *
        (population(target) / Math.max(1, population(attacker))) *
        ((1 + fortDefense(target) / 100) / (1 + fortDefense(attacker) / 100))
      );
    },
  };
}
