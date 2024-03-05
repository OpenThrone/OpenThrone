import { PlayerUnit, PlayerItem } from "@/types/typings";
import UserModel from "./Users";

export class SpyUserModel {
  units: PlayerUnit[] | null;
  items: PlayerItem[] | null;
  fort_level: number | null;
  fort_hitpoints: number | null;
  goldInBank: number | null;

  constructor(defender: UserModel, intelPercentage: number) {
    // Explicitly set each property based on the defender's properties
    console.log(intelPercentage)
    this.units = defender.units
      ? defender.units.map(unit => ({ ...unit, quantity: Math.ceil(unit.quantity * intelPercentage / 100) }))
      : null;
    this.items = defender.items
      ? defender.items.map(item => ({ ...item, quantity: Math.ceil(item.quantity * intelPercentage / 100) }))
      : null;
    this.fort_level = defender.fortLevel
      ? Math.ceil(defender.fortLevel * intelPercentage / 100)
      : 0;
    this.fort_hitpoints = defender.fortHitpoints
      ? Math.ceil(defender.fortHitpoints * intelPercentage / 100)
      : 0;
    this.goldInBank = defender.goldInBank
      ? Math.ceil(defender.goldInBank * intelPercentage / 100)
      : 0;
  }
}