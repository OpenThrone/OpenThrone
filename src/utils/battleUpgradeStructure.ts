/** Structure whose level unlocks a battle upgrade type. */
export type BattleUpgradeStructure = 'OFFENSE' | 'SPY';

/**
 * DEFENSE upgrades unlock with the OFFENSE (siege) structure, SENTRY upgrades
 * with the SPY structure. Server gate, purchase page and army simulator all
 * share this so they cannot drift apart.
 */
export function getBattleUpgradeStructure(
  upgradeType: string,
): BattleUpgradeStructure {
  return upgradeType === 'SPY' || upgradeType === 'SENTRY' ? 'SPY' : 'OFFENSE';
}
