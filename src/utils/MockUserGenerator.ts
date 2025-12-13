import { Unit, Item, UnitUpgradeType, User, PlayerUnit, PlayerItem, PlayerBattleUpgrade, ItemUsage, BattleUpgradeType, UnitType } from "@/types/typings";
import { getLevelFromXP } from "./utilities";
import { ItemType, users as PrismaUser } from "@prisma/client";

export default class MockUserGenerator {
  private prismaUser: PrismaUser;
  private units: PlayerUnit[];
  private items: PlayerItem[];
  private battleUpgrades: PlayerBattleUpgrade[];
  private structureUpgrades: any[];
  private bonusPoints: any[];
  private stats: any[];
  private permissions: any[];

  constructor() {
    this.prismaUser = this.createDefaultPrismaUser();
    this.units = [];
    this.items = [];
    this.battleUpgrades = [];
    this.structureUpgrades = [];
    this.bonusPoints = [];
    this.stats = [];
    this.permissions = [];
    this.addDefaultUnits();
    this.addDefaultItems();
    this.addDefaultBattleUpgrades();
    this.addDefaultStructureUpgrades();
    this.addDefaultBonusPoints();
    this.addDefaultStats();
  }

  private createDefaultPrismaUser(): PrismaUser {
    return {
      id: 1,
      email: 'test@example.com',
      display_name: 'TestUser',
      password_hash: 'hashedpassword',
      twoFactorSecret: null, // From schema
      race: 'HUMAN',
      class: 'FIGHTER',
      experience: 0,
      gold: BigInt(25000),
      gold_in_bank: BigInt(0),
      fort_level: 1,
      fort_hitpoints: 50,
      attack_turns: 50,
      stamina: 100,
      maxStamina: 100,
      last_active: new Date(),
      rank: 0,
      house_level: 0,
      bio: '',
      colorScheme: null,
      recruit_link: '',
      locale: 'en-US',
      economy_level: 0,
      avatar: 'SHIELD',
      created_at: new Date(),
      updated_at: new Date(),
      stats: '{}', // From schema
      killing_str: 1, // From schema
      defense_str: 1, // From schema
      spying_str: 1, // From schema
      sentry_str: 1, // From schema
      offense: 0, // From schema
      defense: 0, // From schema
      spy: 0, // From schema
      sentry: 0, // From schema
      currentEraId: null, // From schema
      achievements: '{}', // From schema
    };
  }

  getPrismaUser(): PrismaUser {
    return this.prismaUser;
  }

  /**
   * Compose a full user object shaped like the Prisma user row that tests expect.
   * This includes units, items, upgrades, bonus points, permissions and stats.
   */
  getUser(): any {
    return {
      ...this.prismaUser,
      UserUnit: this.units,
      UserItem: this.items,
      UserBattleUpgrade: this.battleUpgrades,
      UserStructureUpgrade: this.structureUpgrades,
      UserBonusPoints: this.bonusPoints,
      permissions: this.permissions || [],
      stats: this.stats || [],
    };
  }

  getUnits(): PlayerUnit[] {
    return this.units;
  }

  getItems(): PlayerItem[] {
    return this.items;
  }

  getBattleUpgrades(): PlayerBattleUpgrade[] {
    return this.battleUpgrades;
  }

  getStructureUpgrades(): any[] {
    return this.structureUpgrades;
  }

  getBonusPoints(): any[] {
    return this.bonusPoints;
  }

  getStats(): any[] {
    return this.stats;
  }

  getPermissions(): any[] {
    return this.permissions;
  }

  setBasicInfo(info: Partial<Pick<PrismaUser, 'email' | 'display_name' | 'race' | 'class'>>): this {
    this.prismaUser = { ...this.prismaUser, ...info };
    return this;
  }

  addUnits(unitsToAdd: PlayerUnit[]): this {
    unitsToAdd.forEach((unitToAdd) => {
      const existingUnit = this.units.find(
        (unit) => unit.type === unitToAdd.type && unit.level === unitToAdd.level
      );
      if (existingUnit) {
        // If incoming unit has an explicit id (test intent to set/override), replace quantity.
        // Otherwise accumulate quantities onto defaults.
        if (unitToAdd.id !== undefined && unitToAdd.id !== null) {
          existingUnit.quantity = unitToAdd.quantity;
        } else {
          existingUnit.quantity += unitToAdd.quantity;
        }
      } else {
        this.units.push({
          id: unitToAdd.id,
          userId: unitToAdd.userId,
          type: unitToAdd.type,
          level: unitToAdd.level,
          quantity: unitToAdd.quantity,
          isMercenary: unitToAdd.isMercenary,
        });
      }
    });
    return this;
  }

  addItems(itemsToAdd: PlayerItem[]): this {
    itemsToAdd.forEach((itemToAdd) => {
      const existingItem = this.items.find(
        (item) => item.type === itemToAdd.type && item.level === itemToAdd.level && item.usage === itemToAdd.usage
      );
      if (existingItem) {
        existingItem.quantity += itemToAdd.quantity;
      } else {
        this.items.push({
          id: itemToAdd.id,
          userId: this.prismaUser.id,
          type: itemToAdd.type,
          level: itemToAdd.level,
          quantity: itemToAdd.quantity,
          usage: itemToAdd.usage,
        });
      }
    });
    return this;
  }

  addBattleUpgrades(upgradesToAdd: PlayerBattleUpgrade[]): this {
    upgradesToAdd.forEach((upgradeToAdd) => {
      const existingUpgrade = this.battleUpgrades.find(
        (upgrade) => upgrade.type === upgradeToAdd.type && upgrade.level === upgradeToAdd.level
      );
      if (existingUpgrade) {
        existingUpgrade.quantity += upgradeToAdd.quantity;
      } else {
        this.battleUpgrades.push({
          id: upgradeToAdd.id,
          userId: this.prismaUser.id,
          type: upgradeToAdd.type,
          level: upgradeToAdd.level,
          quantity: upgradeToAdd.quantity,
        });
      }
    });
    return this;
  }

  addExperience(amount: number): this {
    this.prismaUser.experience += amount;
    return this;
  }

  setExperience(amount: number): this {
    this.prismaUser.experience = amount;
    return this;
  }

  adjustGold(amount: bigint): this {
    this.prismaUser.gold += amount;
    if (this.prismaUser.gold < BigInt(0)) this.prismaUser.gold = BigInt(0);
    return this;
  }

  updateStats(statsToUpdate: any[]): this {
    statsToUpdate.forEach((statToUpdate) => {
      const existingStat = this.stats.find(
        (stat) => stat.type === statToUpdate.type && stat.subtype === statToUpdate.subtype
      );
      if (existingStat) {
        existingStat.stat += statToUpdate.stat;
      } else {
        this.stats.push(statToUpdate);
      }
    });
    return this;
  }

  setOffense(offense: number): this {
    this.prismaUser.offense = offense;
    return this;
  }

  setDefense(defense: number): this {
    this.prismaUser.defense = defense;
    return this;
  }

  setSpy(spy: number): this {
    this.prismaUser.spy = spy;
    return this;
  }

  setSentry(sentry: number): this {
    this.prismaUser.sentry = sentry;
    return this;
  }

  setFortLevel(level: number): this {
    this.prismaUser.fort_level = level;
    return this;
  }

  setFortHitpoints(hitpoints: number): this {
    this.prismaUser.fort_hitpoints = hitpoints;
    return this;
  }

  setStamina(stamina: number): this {
    this.prismaUser.stamina = stamina;
    return this;
  }

  setMaxStamina(maxStamina: number): this {
    this.prismaUser.maxStamina = maxStamina;
    return this;
  }

  setStructureUpgrade(type: string, level: number): this {
    const existingUpgrade = this.structureUpgrades.find(
      (upgrade) => upgrade.type === type
    );
    if (existingUpgrade) {
      existingUpgrade.level = level;
    } else {
      this.structureUpgrades.push({ id: 0, userId: this.prismaUser.id, type, level });
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

  setArmoryUpgrade(level: number): this {
    return this.setStructureUpgrade('ARMORY', level);
  }

  public clearUnits(): this {
    this.units = [];
    return this;
  }

  public clearItems(): this {
    this.items = [];
    return this;
  }

  public clearBattleUpgrades(): this {
    this.battleUpgrades = [];
    return this;
  }

  public setLevel(level: number): this {
    (this.prismaUser as any).level = level;
    // Approximate XP for level to ensure consistency if calculated elsewhere
    this.prismaUser.experience = Math.pow(level, 2) * 1000; 
    return this;
  }

  private addDefaultUnits(): void {
    // Add default units that are commonly expected by tests
    this.addUnits([
      { id: 0, userId: this.prismaUser.id, type: 'SPY' as UnitType, level: 1, quantity: 1000, isMercenary: false },
      { id: 0, userId: this.prismaUser.id, type: 'SPY' as UnitType, level: 2, quantity: 1000, isMercenary: false },
      { id: 0, userId: this.prismaUser.id, type: 'SPY' as UnitType, level: 3, quantity: 1000, isMercenary: false },
      { id: 0, userId: this.prismaUser.id, type: 'SENTRY' as UnitType, level: 1, quantity: 500, isMercenary: false },
      { id: 0, userId: this.prismaUser.id, type: 'SENTRY' as UnitType, level: 2, quantity: 500, isMercenary: false },
      { id: 0, userId: this.prismaUser.id, type: 'DEFENSE' as UnitType, level: 1, quantity: 1000, isMercenary: false },
      { id: 0, userId: this.prismaUser.id, type: 'OFFENSE' as UnitType, level: 1, quantity: 500, isMercenary: false },
      { id: 0, userId: this.prismaUser.id, type: 'CITIZEN' as UnitType, level: 1, quantity: 2000, isMercenary: false },
      { id: 0, userId: this.prismaUser.id, type: 'WORKER' as UnitType, level: 1, quantity: 1000, isMercenary: false },
    ]);
  }

  private addDefaultItems(): void {
    this.addItems([
      { id: 0, userId: this.prismaUser.id, type: 'WEAPON' as ItemType, level: 1, quantity: 1, usage: 'OFFENSE' as ItemUsage },
    ]);
  }

  private addDefaultBattleUpgrades(): void {
    this.addBattleUpgrades([
      { id: 0, userId: this.prismaUser.id, type: 'OFFENSE' as BattleUpgradeType, level: 1, quantity: 1 },
      { id: 0, userId: this.prismaUser.id, type: 'SPY' as BattleUpgradeType, level: 1, quantity: 1 },
      { id: 0, userId: this.prismaUser.id, type: 'SENTRY' as BattleUpgradeType, level: 1, quantity: 1 },
      { id: 0, userId: this.prismaUser.id, type: 'DEFENSE' as BattleUpgradeType, level: 1, quantity: 1 }
    ]);
  }

  private addDefaultStructureUpgrades(): void {
    this.setStructureUpgrade('OFFENSE', 1);
    this.setStructureUpgrade('SPY', 1);
    this.setStructureUpgrade('SENTRY', 1);
    this.setStructureUpgrade('ARMORY', 1);
  }

  private addDefaultBonusPoints(): void {
    this.bonusPoints.push(
      { id: 0, userId: this.prismaUser.id, type: 'OFFENSE', level: 0 },
      { id: 0, userId: this.prismaUser.id, type: 'DEFENSE', level: 0 },
      { id: 0, userId: this.prismaUser.id, type: 'INCOME', level: 0 },
      { id: 0, userId: this.prismaUser.id, type: 'INTEL', level: 0 },
      { id: 0, userId: this.prismaUser.id, type: 'PRICES', level: 0 }
    );
  }

  private addDefaultStats(): void {
    this.stats.push(
      { id: 0, userId: this.prismaUser.id, type: 'OFFENSE', subtype: 'WON', stat: 0 },
      { id: 0, userId: this.prismaUser.id, type: 'OFFENSE', subtype: 'LOST', stat: 0 },
      { id: 0, userId: this.prismaUser.id, type: 'DEFENSE', subtype: 'WON', stat: 0 },
      { id: 0, userId: this.prismaUser.id, type: 'DEFENSE', subtype: 'LOST', stat: 0 },
      { id: 0, userId: this.prismaUser.id, type: 'SPY', subtype: 'WON', stat: 0 },
      { id: 0, userId: this.prismaUser.id, type: 'SPY', subtype: 'LOST', stat: 0 },
      { id: 0, userId: this.prismaUser.id, type: 'SENTRY', subtype: 'WON', stat: 0 },
      { id: 0, userId: this.prismaUser.id, type: 'SENTRY', subtype: 'LOST', stat: 0 }
    );
  }
}
