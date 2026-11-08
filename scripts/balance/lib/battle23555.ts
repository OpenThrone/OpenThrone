/**
 * Battle #23555 fixture (#200): the recorded sides and a runner that returns
 * casualties (killed and wounded), fort damage, chip damage and the cap that
 * bound each side. Shared by scripts/balance/battle-23555.ts and its test.
 */
import { Fortifications, OffensiveUpgrades } from '@/constants';
import { DEFENDER_FATIGUE_PER_PRESSURE } from '@/constants/KingdomMorale';
import { executeAttack, type SimulationOptions } from '@/utils/attackFunctions';
import {
  type CombatRuleset,
  deriveCombatRuleset,
} from '@/utils/balance/combatRuleset';
import { CURRENT_COMBAT_RULESET } from '@/utils/balance/combatRulesets';
import { createSeededRandom } from '@/utils/random';

const SLOTS = ['WEAPON', 'HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD'];
export const MIDPOINT = () => 0.5;

export type Roster = {
  offense?: number;
  defense?: number;
  workers?: number;
  citizens?: number;
  offenseSets?: number;
  defenseSets?: number;
};

export type Setup = {
  level: number;
  xp: number;
  fort: number;
  fortHp?: number;
  roster: Roster;
  stamina?: number;
  fatigue?: number;
};

export function makeUser(name: string, s: Setup) {
  const fort = Fortifications.find((f) => f.level === s.fort)!;
  const r = s.roster;
  const units = [
    ['OFFENSE', r.offense ?? 0],
    ['DEFENSE', r.defense ?? 0],
    ['WORKER', r.workers ?? 0],
    ['CITIZEN', r.citizens ?? 0],
  ]
    .filter(([, quantity]) => (quantity as number) > 0)
    .map(([type, quantity], i) => ({
      id: i + 1,
      userId: 1,
      type,
      level: 1,
      quantity,
      isMercenary: false,
    }));
  const sets = (usage: string, quantity: number) =>
    quantity > 0
      ? SLOTS.map((type) => ({ usage, type, level: 1, quantity }))
      : [];
  return {
    id: name,
    displayName: name,
    level: s.level,
    race: 'HUMAN',
    class: 'FIGHTER',
    houseLevel: 1,
    fortLevel: s.fort,
    fortHitpoints: s.fortHp ?? fort.hitpoints,
    gold: 2_000_000n,
    units,
    mercenaries: [],
    items: [
      ...sets('OFFENSE', r.offenseSets ?? 0),
      ...sets('DEFENSE', r.defenseSets ?? 0),
    ],
    structure_upgrades: [{ type: 'ARMORY', level: 1 }],
    battle_upgrades: [],
    attackBonus:
      OffensiveUpgrades.filter((u) => u.level <= s.fort).at(-1)
        ?.offenseBonusPercentage ?? 0,
    defenseBonus: fort.defenseBonusPercentage,
    defensePressureToday: (s.fatigue ?? 0) / DEFENDER_FATIGUE_PER_PRESSURE,
    stamina: s.stamina ?? 100,
    experience: s.xp,
  };
}

/** The recorded sides of battle #23555. */
export const ATTACKER: Setup = {
  level: 3,
  xp: 18_365,
  fort: 1,
  roster: { offense: 164, offenseSets: 84 },
};
export const DEFENDER: Setup = {
  level: 1,
  xp: 3_038,
  fort: 1,
  fortHp: 50,
  roster: {
    defense: 770,
    workers: 1_271,
    citizens: 101,
    offense: 50,
    defenseSets: 589,
  },
};

/** A ruleset (the current one by default) with chip constants changed, for what-if and historical runs. */
export const withChipRules = (
  constants: Partial<{
    CHIP_TAPER_START_RATIO: number;
    CHIP_TAPER_FULL_RATIO: number;
    CHIP_FROM_TROOPS_ONLY: boolean;
  }>,
  base: CombatRuleset = CURRENT_COMBAT_RULESET,
) => deriveCombatRuleset(base, 'combat-23555', { constants });

/** No taper on hopeless assaults, as filed in the issue. */
export const CHIP_TAPER_OFF = {
  CHIP_TAPER_START_RATIO: 0,
  CHIP_TAPER_FULL_RATIO: 1e-9,
};

export type Scenario = {
  label: string;
  attacker: Setup;
  defender: Setup;
  turns: number;
  protectedDefender: boolean;
  options?: Partial<SimulationOptions>;
  /** Seeded rolls instead of the midpoint. */
  seed?: string;
};

export async function run(sc: Scenario) {
  const attacker = makeUser('A', sc.attacker);
  const defender = makeUser('D', sc.defender);
  const random = sc.seed ? createSeededRandom(sc.seed) : MIDPOINT;
  const r: any = await executeAttack(
    attacker as any,
    defender as any,
    sc.turns,
    sc.protectedDefender,
    { random, ...sc.options },
  );
  const wounded = (side: 'attacker' | 'defender') =>
    (r.wounded?.[side] ?? []).reduce(
      (sum: number, g: { quantity: number }) => sum + g.quantity,
      0,
    );
  const killed = (side: 'Attacker' | 'Defender') => r.Losses[side].total;
  const audit = r.damageAudit;
  const chip = (r.mitigationLog ?? [])
    .filter((m: any) => m.source === 'ATTACKER')
    .map((m: any) => m.rawDamage);
  return {
    result: r.result as string,
    reason: r.canonicalOutcome?.reason as string,
    attKilled: killed('Attacker'),
    attWounded: wounded('attacker'),
    defKilled: killed('Defender'),
    defWounded: wounded('defender'),
    attLost: killed('Attacker') + wounded('attacker'),
    defLost: killed('Defender') + wounded('defender'),
    summary: [
      r.casualtySummary?.attackerTotal,
      r.casualtySummary?.defenderTotal,
    ],
    fortDmg:
      (sc.defender.fortHp ??
        Fortifications.find((f) => f.level === sc.defender.fort)!.hitpoints) -
      r.finalFortHP,
    chipRaw: chip.reduce((a: number, b: number) => a + b, 0),
    attBind: audit?.attacker?.bindingCap ?? 'n/a',
    defBind: audit?.defender?.bindingCap ?? 'n/a',
    attAudit: audit?.attacker,
    defAudit: audit?.defender,
    log: r.mitigationLog as any[],
    atkFatigue: r.attackerFatiguePercent,
    defFatigue: r.defenderFatiguePercent,
    gold: String(r.pillagedGold ?? 0n),
    xp: [r.experienceGained?.attacker ?? 0, r.experienceGained?.defender ?? 0],
  };
}
