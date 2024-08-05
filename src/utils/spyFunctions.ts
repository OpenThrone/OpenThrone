import { Fortifications, ItemTypes, UnitTypes } from "@/constants";
import UserModel from "@/models/Users";
import { Item, PlayerUnit } from "@/types/typings";
import stringifyObj from "@/utils/numberFormatting";
import { calculateClandestineStrength, computeSpyCasualties } from "./attackFunctions";
import mtRand from "./mtrand";
import { SpyUserModel } from "@/models/SpyUser";

export function computeSpyAmpFactor(targetPop: number): number {
  let ampFactor = 0.4;

  const breakpoints = [
    { limit: 10, factor: 1.6 },
    { limit: 9, factor: 1.5 },
    { limit: 7, factor: 1.35 },
    { limit: 5, factor: 1.2 },
    { limit: 3, factor: 0.95 },
    { limit: 1, factor: 0.75 },
  ];

  for (const bp of breakpoints) {
    if (targetPop <= bp.limit) {
      ampFactor *= bp.factor;
      break;
    }
  }

  return ampFactor;
}

export class AssassinationResult {
  //attacker: UserModel;
  //defender: UserModel;
  spiesSent: number;
  spiesLost: number;
  unitsKilled: number;
  unit: string;

  success: boolean;
  experienceGained: number;
  goldStolen: number;
  units: PlayerUnit[];

  constructor(attacker: UserModel, defender: UserModel, spies: number, unit: string) {
    //this.attacker = JSON.parse(stringifyObj(attacker));  // deep copy
    //this.defender = JSON.parse(stringifyObj(defender));  // deep copy
    this.spiesSent = spies;
    this.spiesLost = 0;
    this.unitsKilled = 0;
    this.unit = unit;
    this.success = false;
    this.experienceGained = 0;
    this.goldStolen = 0;
    this.units = [];

  }
}

export class IntelResult {
  attacker: UserModel;
  defender: UserModel;
  spiesSent: number;
  spiesLost: number;
  success: boolean;
  intelligenceGathered: {
    offense: number | 0;
    defense: number | 0;
    spyOffense: number | 0;
    spyDefense: number | 0;
    units: PlayerUnit[] | null;
    items: Item[] | null;
    fortLevel: number | null;
    fortHitpoints: number | null;
    goldInBank: number | null;
  } | null;

  constructor(attacker: UserModel, defender: UserModel, spiesSent: number) {
    this.attacker = attacker;  // deep copy
    this.defender = defender;  // deep copy
    this.spiesSent = spiesSent;
    this.spiesLost = 0;
    this.success = false;
    this.intelligenceGathered = null;
  }
}

export class InfiltrationResult {
  attacker: UserModel;
  defender: UserModel;
  spiesSent: number;
  spiesLost: number;
  success: boolean;
  fortDmg: number;

  constructor(attacker: UserModel, defender: UserModel, spiesSent: number) {
    this.attacker = attacker;  // deep copy
    this.defender = defender;  // deep copy
    this.spiesSent = spiesSent;
    this.spiesLost = 0;
    this.success = false;
    this.fortDmg = 0;
  }

}

export function getSentryStrength(user: UserModel, spies: number): number {
  let strength = 0;
  let numSentries = 0;
  const sentryUnits = user.units.find((u) => u.type === 'SENTRY' && u.level === 1);
  if (sentryUnits) {
    numSentries = Math.min(sentryUnits.quantity, spies);
    if (numSentries === 0)
      return 0;
    const unitType = UnitTypes.find((unitType) => unitType.type === sentryUnits.type && unitType.level === 1);
    if (unitType) {
      strength += unitType.bonus * numSentries;
    }
    const sentryWeapons = user.items.filter((item) => item.type === 'WEAPON' && item.usage === sentryUnits.type.toString() && item.level === 1);
    if (sentryWeapons) {
      sentryWeapons.forEach((item) => {
        const bonus = ItemTypes.find((w) => w.level === item.level && w.usage === item.usage && w.type === item.type);
        strength += bonus?.bonus * Math.min(item.quantity, numSentries);
      });
    }
  }
  return strength;
}

export function getSpyStrength(user: UserModel, attacker: boolean, spies: number): number {
  let strength = 0;
  let numSpies = 0;
  const spyUnits = user.units.find((u) => (attacker ? u.type === 'SPY' : u.type === 'SENTRY') && u.level === 1);
  if (spyUnits) {
    numSpies = Math.min(spyUnits.quantity, spies);
    const unitType = UnitTypes.find((unitType) => unitType.type === spyUnits.type && unitType.level === 1);
    if (unitType) {
      strength += unitType.bonus * numSpies;
    }
    const spyWeapons = user.items.filter((item) => item.type === 'WEAPON' && item.usage === spyUnits.type.toString() && item.level === 1);
    spyWeapons.forEach((item) => {
      const bonus = ItemTypes.find((w) => w.level === item.level && w.usage === item.usage && w.type === item.type);
      strength += bonus?.bonus * Math.min(item.quantity, numSpies);
    });
  }
  return strength;
}


export function simulateIntel(
  attacker: UserModel,
  defender: UserModel,
  spies: number
): any {
  spies = Math.max(1, Math.min(spies, 10));

  const fortification = Fortifications.find((fort) => fort.level === defender.fortLevel);
  if (!fortification) {
    return { status: 'failed', message: 'Fortification not found', defender: defender.fortLevel };
  }
  let { fortHitpoints } = defender;
  const isSuccessful = attacker.spy > defender.sentry;
  //const defenderSpyUnit = new SpyUserModel(defender, spies * 10)

  const result = new IntelResult(attacker, defender, spies);
  result.success = isSuccessful;
  result.spiesLost = isSuccessful ? 0 : spies;
  if (isSuccessful) {
    // Proceed with gathering intelligence
    const deathRiskFactor = Math.max(0, 1 - (attacker.spy / defender.sentry));
    let spiesLost = 0;
    for (let i = 0; i < spies; i++) {
      if (Math.random() < deathRiskFactor) {
        spiesLost++;
      }
    }
    const intelPercentage = Math.min((spies - spiesLost) * 10, 100);
    const intelKeys = Object.keys(new SpyUserModel(defender, (spies - spiesLost) * 10));
    const selectedKeysCount = Math.ceil(intelKeys.length * intelPercentage / 100);
    const randomizedKeys = intelKeys.sort(() => 0.5 - Math.random()).slice(0, selectedKeysCount);
    console.log('Random Keys:', randomizedKeys, 'Intel Percentage:', intelPercentage, 'Intel Keys:', intelKeys)

    result.intelligenceGathered = randomizedKeys.reduce((partialIntel, key) => {
      const initPartialIntel = partialIntel ?? {
        offense: 0,
        defense: 0,
        spyDefense: 0,
        spyOffense: 0,
        units: null,
        items: null,
        fortLevel: null,
        fortHitpoints: null,
        goldInBank: null,
      };

      if (key === 'units' || key === 'items') {
        const totalTypes = defender[key].length;
        const typesToInclude = Math.floor(totalTypes * intelPercentage / 100);
        initPartialIntel[key] = defender[key].sort(() => 0.5 - Math.random()).slice(0, typesToInclude);
      } else {
        initPartialIntel[key] = defender[key];
      }
      return initPartialIntel;
    }, result.intelligenceGathered);
  } else {
    attacker.units.filter((u) => u.type === 'SPY' && u.level === 1).forEach((u) => u.quantity = u.quantity - spies);
  }
  return result;
}

export const simulateAssassination = (
  attacker: UserModel,
  defender: UserModel,
  spies: number,
  unit: string
) => {
  const isSuccessful = attacker.spy > defender.sentry;

  const result = new AssassinationResult(attacker, defender, spies, unit);
  result.success = isSuccessful;
  result.spiesLost = isSuccessful ? 0 : spies;

  if (isSuccessful) {
    const { spyStrength: attackerKS, sentryStrength: attackerDS } = calculateClandestineStrength(attacker, 'SPY', 5);
    const { spyStrength: defenderKS, sentryStrength: defenderDS } = calculateClandestineStrength(defender, 'SENTRY', 5);
    let defenderUnitCount = () => {
      if (unit === 'OFFENSE') {
        return Math.min(spies * 2, defender.unitTotals.offense);
      }
      if (unit === 'DEFENSE') {
        return Math.min(spies * 2, defender.unitTotals.defense);
      }
      if (unit === 'CITIZEN/WORKERS') {
        return Math.min(spies * 2, (defender.unitTotals.citizens + defender.unitTotals.workers));
      }
      return 0;
    }

    const { attackerCasualties, defenderCasualties } = computeSpyCasualties(attackerKS, attackerDS, defenderKS, defenderDS, spies, defenderUnitCount(), 1, 1);
    result.spiesLost = attackerCasualties;

    if (result.spiesLost > 0) {
      attacker.units.filter((u) => u.type === 'SPY' && u.level === 22).forEach((u) => u.quantity = u.quantity - attackerCasualties);
    }
    result.unitsKilled = defenderCasualties;
    console.log('result thus far: ', result)
    if (defenderCasualties > 0) {
      let defenderUnitType;
      if (unit !== 'CITIZEN/WORKERS') {
        defenderUnitType = defender.units.find((u) => u.type === unit && u.level === 1);
      } else {
        defenderUnitType = defender.units.find((u) => (u.type === 'WORKER' || u.type === 'CITIZEN') && u.level === 1);
      }
      if (defenderUnitType) {
        console.log('DefenderUnitType:', defenderUnitType, 'DefenderCasualties:', defenderCasualties)
        defenderUnitType.quantity = Math.max(0, defenderUnitType.quantity - defenderCasualties);
      }
    }
  } else {
    attacker.units.filter((u) => u.type === 'SPY' && u.level === 1).forEach((u) => u.quantity = u.quantity - spies);
  }
  return result;
}

export const simulateInfiltration =
  (
    attacker: UserModel,
    defender: UserModel,
    spies: number
  ) => {
    const isSuccessful = attacker.spy > defender.sentry;
    const result = new InfiltrationResult(attacker, defender, spies);
    result.success = isSuccessful;
    result.spiesLost = isSuccessful ? 0 : spies;

    const { spyStrength: attackerKS, sentryStrength: attackerDS } = calculateClandestineStrength(attacker, 'SPY', 1);
    const { spyStrength: defenderKS, sentryStrength: defenderDS } = calculateClandestineStrength(defender, 'SENTRY', 1);
    const { attackerCasualties, defenderCasualties } = computeSpyCasualties(attackerKS, attackerDS, defenderKS, defenderDS, spies, defender.unitTotals.sentries, 1, 1);

    if (!isSuccessful) {
      attacker.units.filter((u) => u.type === 'SPY' && u.level === 1).forEach((u) => u.quantity = u.quantity - spies);
      const deathRiskFactor = Math.max(0, 1 - (attacker.spy / defender.sentry));

      let spiesLost = 0;
      for (let i = 0; i < spies; i++) {
        if (Math.random() < deathRiskFactor) {
          spiesLost++;
        }
      }
      result.spiesLost = spiesLost;
      return result
    } else {
      const startHP = result.defender.fortHitpoints;
      for (var i = 1; i <= spies; i++) {
        if (result.defender.fortHitpoints > 0) {
          if (result.attacker.spy / result.defender.sentry <= 0.05)
            result.defender.fortHitpoints -= Math.floor(mtRand(0, 2))
          else if (result.attacker.spy / result.defender.sentry > 0.05 && result.attacker.spy / result.defender.sentry <= 0.5)
            result.defender.fortHitpoints -= Math.floor(mtRand(3, 6));
          else if (result.attacker.spy / result.defender.sentry > 0.5 && result.attacker.spy / result.defender.sentry <= 1.3)
            result.defender.fortHitpoints -= Math.floor(mtRand(6, 16));
          else result.defender.fortHitpoints -= Math.floor(mtRand(12, 24));
          //}
          if (result.defender.fortHitpoints < 0) {
            result.defender.fortHitpoints = 0;
          }
        }
      }
      result.fortDmg += Number(startHP - result.defender.fortHitpoints);

      return result;
    }
  }