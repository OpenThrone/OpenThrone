import type { UnitType } from '@/types/typings';

import { HouseUpgrades } from '../constants';
import {
  calculateDailyReplacementThroughput,
  calculateDefenderDailyCasualtyRemaining,
  calculateDefenderDailyGoldRemaining,
  V5_COMBAT_CONSTANTS,
} from '../utils/balance/v5Combat';
import { CITIZEN_WORKERS_TARGET } from '../utils/spy/results';
import type { AssassinationDailyCaps } from './engine';
import { UNIT_MAPPING } from './engine';
import type { DefenderDailyLedger, PlayerState, UnitCounts } from './types';

/**
 * Simulation mirror of the production defender daily tallies (AttackService and
 * SpyService). Battles and assassinations draw from one casualty budget per OT
 * day, and gold taken today counts against the defender's daily gold ceiling.
 */

export function createDefenderDailyLedger(): DefenderDailyLedger {
  return { casualtiesToday: 0, typeCasualtiesToday: {}, goldTakenToday: 0 };
}

export function getDefenderLedger(player: PlayerState): DefenderDailyLedger {
  if (!player.defenderLedger) {
    player.defenderLedger = createDefenderDailyLedger();
  }
  return player.defenderLedger;
}

export function resetDefenderDailyLedger(player: PlayerState): void {
  player.defenderLedger = createDefenderDailyLedger();
}

function dailyThroughput(defender: PlayerState): number {
  const houseCitizens =
    HouseUpgrades[
      Math.max(
        0,
        Math.floor(defender.houseLevel ?? 0),
      ) as keyof typeof HouseUpgrades
    ]?.citizensDaily ?? 1;
  return calculateDailyReplacementThroughput({
    houseCitizens: Number(houseCitizens),
    race: defender.race,
  });
}

/** Budgets a battle against `defender` must respect today. */
export function battleDailyBudget(defender: PlayerState): {
  defenderDailyCasualtyRemaining: number;
  defenderDailyGoldRemaining: number;
} {
  const ledger = getDefenderLedger(defender);
  return {
    defenderDailyCasualtyRemaining: calculateDefenderDailyCasualtyRemaining({
      dailyThroughput: dailyThroughput(defender),
      casualtiesToday: ledger.casualtiesToday,
    }),
    defenderDailyGoldRemaining: Number(
      calculateDefenderDailyGoldRemaining({
        goldOnHand: BigInt(Math.max(0, Math.floor(defender.gold))),
        goldTakenToday: BigInt(Math.max(0, Math.floor(ledger.goldTakenToday))),
      }),
    ),
  };
}

/** Records a resolved battle's losses and pillage on the defender's ledger. */
export function recordBattleOnLedger(
  defender: PlayerState,
  result: {
    defenderCasualties: Partial<UnitCounts>;
    loot: number;
    winner: string;
  },
): void {
  const ledger = getDefenderLedger(defender);
  const losses = Object.values(result.defenderCasualties).reduce<number>(
    (sum, count) => sum + Math.max(0, Number(count) || 0),
    0,
  );
  ledger.casualtiesToday += losses;
  if (result.winner === 'attacker') {
    ledger.goldTakenToday += Math.max(0, result.loot);
  }
}

/** Units of the given production types the defender holds (CITIZEN_WORKERS sums two). */
function defenderTypeCount(defender: PlayerState, targetUnit: string): number {
  const types: readonly string[] =
    targetUnit === CITIZEN_WORKERS_TARGET
      ? ['CITIZEN', 'WORKER']
      : [targetUnit];
  return UNIT_MAPPING.reduce(
    (sum, mapping) =>
      types.includes(mapping.type)
        ? sum + Math.max(0, defender.units[mapping.key] ?? 0)
        : sum,
    0,
  );
}

/** Assassination caps: shared defender casualty budget plus the per-type share. */
export function assassinationDailyCaps(
  defender: PlayerState,
  targetUnit: UnitType | typeof CITIZEN_WORKERS_TARGET | undefined,
): AssassinationDailyCaps {
  const ledger = getDefenderLedger(defender);
  const key = targetUnit ?? CITIZEN_WORKERS_TARGET;
  const typeLostToday = ledger.typeCasualtiesToday[key] ?? 0;
  const targetCount = defenderTypeCount(defender, key);
  return {
    defenderDailyCasualtyRemaining: calculateDefenderDailyCasualtyRemaining({
      dailyThroughput: dailyThroughput(defender),
      casualtiesToday: ledger.casualtiesToday,
    }),
    targetTypeDailyRemaining: Math.max(
      0,
      Math.floor(
        (targetCount + typeLostToday) *
          V5_COMBAT_CONSTANTS.ASSASSINATION_DAILY_TYPE_SHARE,
      ) - typeLostToday,
    ),
  };
}

/** Records assassination kills on the defender's ledger. */
export function recordAssassinationOnLedger(
  defender: PlayerState,
  targetUnit: UnitType | typeof CITIZEN_WORKERS_TARGET | undefined,
  kills: number,
): void {
  if (kills <= 0) return;
  const ledger = getDefenderLedger(defender);
  const key = targetUnit ?? CITIZEN_WORKERS_TARGET;
  ledger.casualtiesToday += kills;
  ledger.typeCasualtiesToday[key] =
    (ledger.typeCasualtiesToday[key] ?? 0) + kills;
}
