import { Unit, Item, UnitUpgradeType, User, PlayerUnit, PlayerItem, PlayerBattleUpgrade } from "@/types/typings";
import { getLevelFromXP } from "./utilities";

export default class MockUserGenerator {
  private user: User;

  constructor() {
    this.user = this.createDefaultUser();
  }

  private createDefaultUser(): User {
    return {
      id: 1,
      email: 'test@example.com',
      display_name: 'TestUser',
      password_hash: 'hashedpassword',
      race: 'HUMAN',
      class: 'FIGHTER',
      units: [
        { type: 'CITIZEN', level: 1, quantity: 0 },
        { type: 'WORKER', level: 1, quantity: 0 },
        { type: 'OFFENSE', level: 1, quantity: 0 },
        { type: 'DEFENSE', level: 1, quantity: 0 },
        { type: 'SPY', level: 1, quantity: 0 },
        { type: 'SENTRY', level: 1, quantity: 0 },
      ],
      experience: 0,
      gold: BigInt(25000),
      gold_in_bank: BigInt(0),
      fort_level: 1,
      fort_hitpoints: 50,
      attack_turns: 50,
      last_active: new Date(),
      rank: 0,
      items: [
        { type: 'WEAPON', level: 1, quantity: 0, usage: 'OFFENSE' },
      ],
      house_level: 0,
      economy_level: 0,
      offense: 0,
      defense: 0,
      spy: 0,
      sentry: 0,
      battle_upgrades: [
        { type: 'OFFENSE', level: 1, quantity: 0 },
        { type: 'SPY', level: 1, quantity: 0 },
        { type: 'SENTRY', level: 1, quantity: 0 },
        { type: 'DEFENSE', level: 1, quantity: 0 },
      ],
      structure_upgrades: [
        { type: 'OFFENSE', level: 1 },
        { type: 'SPY', level: 1 },
        { type: 'SENTRY', level: 1 },
        { type: 'ARMORY', level: 1 },
      ],
      bonus_points: [
        { type: 'OFFENSE', level: 0 },
        { type: 'DEFENSE', level: 0 },
        { type: 'INCOME', level: 0 },
        { type: 'INTEL', level: 0 },
        { type: 'PRICES', level: 0 },
      ],
      stats: [
        { type: 'OFFENSE', subtype: 'WON', stat: 0 },
        { type: 'OFFENSE', subtype: 'LOST', stat: 0 },
        { type: 'DEFENSE', subtype: 'WON', stat: 0 },
        { type: 'DEFENSE', subtype: 'LOST', stat: 0 },
        { type: 'SPY', subtype: 'WON', stat: 0 },
        { type: 'SPY', subtype: 'LOST', stat: 0 },
        { type: 'SENTRY', subtype: 'WON', stat: 0 },
        { type: 'SENTRY', subtype: 'LOST', stat: 0 },
      ],
      bio: '',
      colorScheme: undefined,
      recruit_link: '',
      locale: 'en-US',
      avatar: 'SHIELD',
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  getUser(): User {
    return this.user;
  }

  setBasicInfo(info: Partial<Pick<User, 'email' | 'display_name' | 'race' | 'class'>>): this {
    this.user = { ...this.user, ...info };
    return this;
  }

  addUnits(unitsToAdd: PlayerUnit[]): this {
    unitsToAdd.forEach((unitToAdd) => {
      const existingUnit = this.user.units.find(
        (unit) => unit.type === unitToAdd.type && unit.level === unitToAdd.level
      );
      if (existingUnit) {
        existingUnit.quantity += unitToAdd.quantity;
      } else {
        this.user.units.push(unitToAdd);
      }
    });
    return this;
  }

  removeUnits(unitsToRemove: PlayerUnit[]): this {
    unitsToRemove.forEach((unitToRemove) => {
      const existingUnit = this.user.units.find(
        (unit) => unit.type === unitToRemove.type && unit.level === unitToRemove.level
      );
      if (existingUnit) {
        existingUnit.quantity -= unitToRemove.quantity;
        if (existingUnit.quantity < 0) existingUnit.quantity = 0;
      }
    });
    return this;
  }

  addItems(itemsToAdd: PlayerItem[]): this {

    itemsToAdd.forEach((itemToAdd) => {
      const existingItem = this.user.items.find(
        (item) => item.type === itemToAdd.type && item.level === itemToAdd.level && item.usage === itemToAdd.usage
      );
      if (existingItem) {
        existingItem.quantity += itemToAdd.quantity;
      } else {
        this.user.items.push(itemToAdd);
      }
    });
    return this;
  }

  removeItems(itemsToRemove: PlayerItem[]): this {
    itemsToRemove.forEach((itemToRemove) => {
      const existingItem = this.user.items.find(
        (item) => item.type === itemToRemove.type && item.level === itemToRemove.level
      );
      if (existingItem) {
        existingItem.quantity -= itemToRemove.quantity;
        if (existingItem.quantity < 0) existingItem.quantity = 0;
      }
    });
    return this;
  }

  addBattleUpgrades(upgradesToAdd: PlayerBattleUpgrade[]): this {
    upgradesToAdd.forEach((upgradeToAdd) => {
      const existingUpgrade = this.user.battle_upgrades.find(
        (upgrade) => upgrade.type === upgradeToAdd.type && upgrade.level === upgradeToAdd.level
      );
      if (existingUpgrade) {
        existingUpgrade.quantity += upgradeToAdd.quantity;
      } else {
        this.user.battle_upgrades.push(upgradeToAdd);
      }
    });
    return this;
  }

  removeBattleUpgrades(upgradesToRemove: PlayerBattleUpgrade[]): this {
    upgradesToRemove.forEach((upgradeToRemove) => {
      const existingUpgrade = this.user.battle_upgrades.find(
        (upgrade) => upgrade.type === upgradeToRemove.type && upgrade.level === upgradeToRemove.level
      );
      if (existingUpgrade) {
        existingUpgrade.quantity -= upgradeToRemove.quantity;
        if (existingUpgrade.quantity < 0) existingUpgrade.quantity = 0;
      }
    });
    return this;
  }

  addExperience(amount: number): this {
    this.user.experience += amount;
    return this;
  }

  setExperience(amount: number): this {
    this.user.experience = amount;
    this.user.level = getLevelFromXP(this.user.experience);
    return this;
  }

  adjustGold(amount: bigint): this {
    this.user.gold += amount;
    if (this.user.gold < BigInt(0)) this.user.gold = BigInt(0);
    return this;
  }

  updateStats(statsToUpdate: any[]): this {
    statsToUpdate.forEach((statToUpdate) => {
      const existingStat = this.user.stats.find(
        (stat) => stat.type === statToUpdate.type && stat.subtype === statToUpdate.subtype
      );
      if (existingStat) {
        existingStat.stat += statToUpdate.stat;
      } else {
        this.user.stats.push(statToUpdate);
      }
    });
    return this;
  }

  setOffense(offense: number): this {
    this.user.offense = offense;
    return this;
  }

  setDefense(defense: number): this {
    this.user.defense = defense;
    return this;
  }

  setSpy(spy: number): this {
    this.user.spy = spy;
    return this;
  }

  setSentry(sentry: number): this {
    this.user.sentry = sentry;
    return this;
  }

  setFortLevel(level: number): this {
    this.user.fort_level = level;
    return this;
  }

  setFortHitpoints(hitpoints: number): this {
    this.user.fort_hitpoints = hitpoints;
    return this;
  }

  setStructureUpgrade(type: string, level: number): this {
    const existingUpgrade = this.user.structure_upgrades.find(
      (upgrade) => upgrade.type === type
    );
    if (existingUpgrade) {
      existingUpgrade.level = level; // Update the level of the existing upgrade
    } else {
      this.user.structure_upgrades.push({ type, level }); // Add a new upgrade if it doesn't exist
    }
    return this;
  }

  setSpyUpgrade(level: number): this {
    return this.setStructureUpgrade('SPY', level);
  }

  setOffenseUpgrade(level: number): this {
    return this.setStructureUpgrade('OFFENSE', level);
  }

  setSentryUpgrade(level: number): this {
    return this.setStructureUpgrade('SENTRY', level);
  }

  setLevel(level: number): this {
    this.user.level = level;
    return this;
  }

  setArmoryUpgrade(level: number): this {
    return this.setStructureUpgrade('ARMORY', level);
  }

  public clearUnits(): this {
    this.user.units = [];
    return this;
  }
  public clearItems(): this {
    this.user.items = [];
    return this;
  }

}
