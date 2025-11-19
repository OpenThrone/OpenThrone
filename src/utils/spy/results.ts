import UserModel from "@/models/Users";
import { Item, PlayerUnit, UnitType } from "@/types/typings";

export const CITIZEN_WORKERS_TARGET = 'CITIZEN_WORKERS';

export class AssassinationResult {
  spiesSent: number;
  spiesLost: number;
  unitsKilled: number;
  targetUnit: string;
  success: boolean;
  experienceGained: number;
  goldStolen: number;
  units: PlayerUnit[];

  constructor(attacker: UserModel, defender: UserModel, spies: number, target: UnitType | typeof CITIZEN_WORKERS_TARGET = CITIZEN_WORKERS_TARGET) {
    this.spiesSent = spies;
    this.spiesLost = 0;
    this.unitsKilled = 0;
    this.targetUnit = target;
    this.success = false;
    this.experienceGained = 0;
    this.goldStolen = 0;
    this.units = (defender.units as PlayerUnit[]).filter((unit) =>
      target === CITIZEN_WORKERS_TARGET
        ? unit.type === ('CITIZEN' as UnitType) || unit.type === ('WORKER' as UnitType)
        : unit.type === (target as UnitType)
    );
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