import { ItemTypes, UnitTypes } from "@/constants";
import UserModel from "@/models/Users";
import { Item, PlayerUnit } from "@/types/typings";

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
  //attacker: UserModel;
  //defender: UserModel;
  spiesSent: number;
  spiesLost: number;
  success: boolean;
  intelligenceGathered: {
    units: PlayerUnit[] | null;
    items: Item[] | null;
    fortLevel: number | null;
    fortHitpoints: number | null;
    goldInBank: number | null;
  } | null;

  constructor(attacker: UserModel, defender: UserModel, spiesSent: number) {
    //this.attacker = JSON.parse(stringifyObj(attacker));  // deep copy
    //this.defender = JSON.parse(stringifyObj(defender));  // deep copy
    this.spiesSent = spiesSent;
    this.spiesLost = 0;
    this.success = false;
    this.intelligenceGathered = null;
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