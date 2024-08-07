import { PlayerUnit, Item } from "@/types/typings";
import UserModel from "./Users";

export class SpyUserModel {
  units: PlayerUnit[] | null;
  items: Item[] | null;
  fort_level: number | null;
  fort_hitpoints: number | null;
  goldInBank: bigint | null;

  constructor(defender: UserModel, intelPercentage: number) {
    // Explicitly set each property based on the defender's properties
    this.units = defender.units
      ? defender.units.map(unit => ({ ...unit, quantity: Math.ceil(unit.quantity * intelPercentage / 100) }))
      : null;
    this.items = defender.items
      ? defender.items.map(item => ({ ...item, quantity: Math.ceil(item.quantity * intelPercentage / 100) }))
      : null;
    this.fort_level = defender.fortLevel !== null
      ? Math.ceil(defender.fortLevel * intelPercentage / 100)
      : null;
    this.fort_hitpoints = defender.fortHitpoints !== null
      ? Math.ceil(defender.fortHitpoints * intelPercentage / 100)
      : null;
    this.goldInBank = defender.goldInBank !== null
      ? defender.goldInBank // * BigInt(intelPercentage)) / BigInt(100)
      : BigInt(0);
  }
}