import md5 from 'md5';

import type {
  BonusPointsItem,
  DefensiveUpgradeType,
  FortHealth,
  Fortification,
  Locales,
  OffensiveUpgradeType,
  PlayerClass,
  PlayerItem,
  PlayerRace,
  PlayerUnit,
  SentryUpgradeType,
  SpyUpgradeType,
  Unit,
  UnitTotalsType,
  UnitType,
  Weapon,
} from '@/types/typings';

import {
  ArmoryUpgrades,
  BattleUpgrades,
  Bonuses,
  EconomyUpgrades,
  Fortifications,
  HouseUpgrades,
  OffenseiveUpgrades,
  SentryUpgrades,
  SpyUpgrades,
  UnitTypes,
  WeaponTypes,
  levelXPArray,
} from '../constants';

class UserModel {
  public id: number;

  public displayName: string;

  public email: string;

  public passwordHash: string;

  public race: PlayerRace;

  public class: PlayerClass;

  public experience: number;

  public gold: number;

  public goldInBank: number;

  public fortLevel: number;

  public fortHitpoints: number;

  public houseLevel: number;

  public attackTurns: number;

  public units: PlayerUnit[];

  public items: PlayerItem[];

  public last_active: Date;

  public bio: string;

  public colorScheme: string;

  public is_player: boolean;

  public is_online: boolean;

  public overallrank: number;

  public attacks_made: number;

  public attacks_defended: number;

  public attacks_won: number;

  public defends_won: number;

  public bonus_points: BonusPointsItem[];

  public economyLevel: number;

  public structure_upgrades: any[];

  public beenAttacked: boolean;

  public locale: Locales;

  constructor(userData: any, filtered: boolean = true) {
    this.id = 0;
    this.displayName = '';
    this.email = '';
    this.passwordHash = '';
    this.race = 'ELF';
    this.class = 'ASSASSIN';
    this.experience = 0;
    this.gold = 0;
    this.goldInBank = 0;

    this.fortLevel = 0;
    this.fortHitpoints = 0;
    this.houseLevel = 0;
    this.attacks_made = 0;
    this.attacks_defended = 0;
    this.bonus_points = [];
    this.attackTurns = 0;
    this.last_active = new Date();
    this.units = [];
    this.items = [];
    this.bio = '';
    this.colorScheme = '';
    this.is_player = false;
    this.is_online = false;
    this.overallrank = 0;
    this.economyLevel = 0;
    this.attacks_won = 0;
    this.defends_won = 0;
    this.beenAttacked = false;
    this.structure_upgrades = [];
    this.locale = 'en-US';
    if (userData) {
      this.id = userData.id;
      this.displayName = userData.display_name;
      if (!filtered) {
        this.email = userData.email;
        this.passwordHash = userData.password_hash;
        this.goldInBank = userData.gold_in_bank;
      }
      this.economyLevel = userData.economy_level;

      this.attackTurns = userData.attack_turns;
      this.race = userData.race;
      this.class = userData.class;
      this.experience = userData.experience;
      this.gold = userData.gold;
      this.goldInBank = userData.gold_in_bank;
      this.fortLevel = userData.fort_level;
      this.fortHitpoints = userData.fort_hitpoints;
      this.houseLevel = userData.house_level;

      this.last_active = userData.last_active;
      this.units = userData.units;
      this.items = userData.items;
      this.bio = userData.bio;
      this.colorScheme = userData.colorScheme;
      this.is_player = false;
      this.overallrank = 0;
      this.attacks_made = userData.totalAttacks;
      this.attacks_defended = userData.totalDefends;
      this.bonus_points = userData.bonus_points;
      this.attacks_won = userData.won_attacks;
      this.defends_won = userData.won_defends;
      this.structure_upgrades = userData.structure_upgrades;
      this.locale = userData.locale;
    }
  }

  get attacksWon(): number {
    return this.attacks_won;
  }

  get defendsWon(): number {
    return this.defends_won;
  }

  /**
   * Returns the number of available proficiency points for the user.
   * This is calculated by subtracting the sum of bonus points' levels from the user's level.
   * @returns {number} The number of available proficiency points.
   */
  get availableProficiencyPoints() {
    return (
      this.level -
      this.bonus_points.reduce((acc, bonus) => acc + bonus.level, 0)
    );
  }

  /**
   * Returns the number of used proficiency points for the user.
   * This is calculated by subtracting the sum of bonus points' levels from the user's level.
   * @returns {number} The number of available proficiency points.
   */
  get usedProficiencyPoints() {
    return (
      this.bonus_points.reduce((acc, bonus) => acc + bonus.level, 0)
    );
  }

  /**
   * Returns an array of bonuses that are applicable to the user's race or class.
   * @returns {Array<Bonus>} An array of Bonus objects.
   */
  get playerBonuses() {
    return Bonuses.filter(
      (bonus) => bonus.race === this.race || bonus.race === this.class
    );
  }

  /**
   * Calculates the total income bonus for the user based on their race, class, and bonus points.
   * @returns The total income bonus for the user.
   */
  get incomeBonus() {
    const income = Bonuses.filter(
      (bonus) =>
        (bonus.race === this.race || bonus.race === this.class) &&
        bonus.bonusType === 'INCOME'
    ).reduce(function (count, stat) {
      return count + stat.bonusAmount;
    }, 0);
    const incomeLevelBonus = this.bonus_points
      .filter((bonus) => bonus.type === 'INCOME')
      .reduce((acc, bonus) => acc + bonus.level, 0);
    return income + incomeLevelBonus;
  }

  /**
   * Returns the recruiting link for the user.
   * The recruiting link is generated by hashing the user's ID using the MD5 algorithm.
   * @returns {string} The recruiting link for the user.
   */
  get recruitingLink() {
    return md5(this.id.toString());
  }

  /**
   * Returns the total attack bonus for the user.
   * @returns {number} The total attack bonus.
   */
  get attackBonus() {
    const attack = Bonuses.filter(
      (bonus) =>
        (bonus.race === this.race || bonus.race === this.class) &&
        bonus.bonusType === 'OFFENSE'
    ).reduce(function (count, stat) {
      return count + stat.bonusAmount;
    }, 0);
    const offenseLevelBonus = this.bonus_points
      .filter((bonus) => bonus.type === 'OFFENSE')
      .reduce((acc, bonus) => acc + bonus.level, 0);
    return attack + offenseLevelBonus;
  }

  /**
   * Returns the total defense bonus for the user, calculated by summing up the defense bonuses from the user's race and class, as well as any bonus points allocated to defense.
   * @returns {number} The total defense bonus for the user.
   */
  get defenseBonus(): number {
    const defense = Bonuses.filter(
      (bonus) =>
        (bonus.race === this.race || bonus.race === this.class) &&
        bonus.bonusType === 'DEFENSE'
    ).reduce(function (count, stat) {
      return count + stat.bonusAmount;
    }, 0);
    const defenseLevelBonus = this.bonus_points
      .filter((bonus) => bonus.type === 'DEFENSE')
      .reduce((acc, bonus) => acc + bonus.level, 0);
    return defense + defenseLevelBonus;
  }

  /**
   * Calculates the total intelligence bonus for the user.
   * @returns {number} The total intelligence bonus.
   */
  get intelBonus() {
    const intel = Bonuses.filter(
      (bonus) =>
        (bonus.race === this.race || bonus.race === this.class) &&
        bonus.bonusType === 'INTEL'
    ).reduce(function (count, stat) {
      return count + stat.bonusAmount;
    }, 0);
    const intelLevelBonus = this.bonus_points
      .filter((bonus) => bonus.type === 'INTEL')
      .reduce((acc, bonus) => acc + bonus.level, 0);
    return intel + intelLevelBonus;
  }

  get spyBonus() {
    return SpyUpgrades[this?.spyLevel].offenseBonusPercentage + this.intelBonus;
  }

  get sentryBonus() {
    return SentryUpgrades[this?.sentryLevel].defenseBonusPercentage + this.intelBonus;
  }

  /**
   * Returns the total recruiting bonus for the user.
   * @returns {number} The total recruiting bonus.
   */
  get recruitingBonus() {
    const recruiting = Bonuses.filter(
      (bonus) =>
        (bonus.race === this.race || bonus.race === this.class) &&
        bonus.bonusType === 'RECRUITING'
    ).reduce(function (count, stat) {
      return count + stat.bonusAmount;
    }, 0);
    const houseBonus = HouseUpgrades[this.houseLevel].citizensDaily;
    return parseInt(recruiting + houseBonus, 10);
  }

  /**
   * Returns the total casualty bonus for the user based on their race and class.
   * @returns {number} The total casualty bonus.
   */
  get casualtyBonus() {
    const casualty = Bonuses.filter(
      (bonus) =>
        (bonus.race === this.race || bonus.race === this.class) &&
        bonus.bonusType === 'CASUALTY'
    ).reduce(function (count, stat) {
      return count + stat.bonusAmount;
    }, 0);
    return casualty;
  }

  /**
   * Returns the total charisma bonus for the user based on their race and class
   * @returns {number} The total price bonus.
   */
  get priceBonus() {
    const price = Bonuses.filter(
      (bonus) =>
        (bonus.race === this.race || bonus.race === this.class) &&
        bonus.bonusType === 'PRICES'
    ).reduce(function (count, stat) {
      return count + stat.bonusAmount;
    }, 0);
    return price + this.bonus_points.find((bonus) => bonus.type === 'PRICES')?.level || 0;
  }

  /**
   * Returns the total number of units in the army, excluding CITIZEN and WORKER units.
   * @returns {number} The total number of units in the army.
   */
  get armySize(): number {
    return this.units
      .filter((unit) => unit.type !== 'CITIZEN' && unit.type !== 'WORKER')
      .reduce((acc, unit) => acc + unit.quantity, 0);
  }

  /**
   * Returns the total population of the user, calculated by summing the quantity of all units.
   * @returns {number} The total population of the user.
   */
  get population() {
    return this.units.reduce((acc, unit) => acc + unit.quantity, 0);
  }

  /**
   * Returns the number of citizens in the units array.
   * @returns {number} The number of citizens.
   */
  get citizens(): number {
    return this.units.find((unit) => unit.type === 'CITIZEN').quantity;
  }

  /**
   * Returns the total gold per turn for the user, calculated based on the number of worker units and fortification level.
   * @returns The total gold per turn for the user.
   */
  get goldPerTurn(): number {
    const workerUnits = this.units.filter((units) => units.type === 'WORKER');
    const workerGoldPerTurn = workerUnits
      .map(
        (unit) =>
          EconomyUpgrades[this.economyLevel]?.goldPerWorker *
          unit.quantity *
          (1 + parseInt(this.incomeBonus.toString(), 10) / 100)
      )
      .reduce((acc, gold) => acc + gold, 0);

    const fortificationGoldPerTurn =
      Fortifications[this.fortLevel - 1]?.goldPerTurn;
    return workerGoldPerTurn + fortificationGoldPerTurn + (this.incomeBonus / 100 * (workerGoldPerTurn + fortificationGoldPerTurn));
  }

  /**
   * Returns the amount of gold earned per turn based on the current fortification level.
   * @returns {number} The amount of gold earned per turn.
   */
  get fortificationGoldPerTurn(): number {
    return Fortifications[this.fortLevel - 1]?.goldPerTurn || 0;
  }

  /**
   * Returns the total amount of gold earned per turn by all worker units owned by the user.
   * @returns The total amount of gold earned per turn by all worker units owned by the user.
   */
  get workerGoldPerTurn(): number {
    const workerUnits = this.units.filter(unit => unit.type === 'WORKER');
    if (!workerUnits.length) {
      return 0; // No worker units.
    }

    // Calculate the total gold
    let totalGold = 0;
    for (const unit of workerUnits) {
      const workerBonus = EconomyUpgrades[this.economyLevel]?.goldPerWorker;

      // Calculate the gold earned by this type of worker after considering incomeBonus.
      const workerGold = workerBonus * (1 + parseInt(this.incomeBonus.toString(), 10) / 100);

      totalGold += workerGold * unit.quantity;
    }

    return totalGold;
  }

  /**
   * Returns the total amount of gold generated per turn by the user, 
   * which is the sum of gold generated by fortifications and workers.
   * @returns {number} The total gold generated per turn.
   */
  get totalGoldPerTurn(): number {
    return this.fortificationGoldPerTurn + this.workerGoldPerTurn;
  }


  /**
   * Returns the amount of gold earned per turn by each worker unit.
   * This assumes all worker units are of the same type and level.
   * If there are different types or levels of workers, this will only return the value for the first one.
   * DT only had 1 type of worker AFAIK
   * @returns The amount of gold earned per turn by each worker unit.
   */
  get goldPerWorkerPerTurn(): number {
    const workerUnit = this.units.find(unit => unit.type === 'WORKER');
    if (!workerUnit) {
      return 0; // No worker units.
    }

    const workerBonus = EconomyUpgrades[this.economyLevel as keyof typeof EconomyUpgrades]?.goldPerWorker;

    // Calculate the bonus per worker after considering incomeBonus.
    const workerGoldPerTurn = workerBonus ? workerBonus * (1 + parseInt(this.incomeBonus.toString(), 10) / 100) : 0;

    return workerGoldPerTurn;
  }

  getLevelForUnit(type: UnitType) {
    switch (type) {
      case 'OFFENSE':
        return this.fortLevel;
      case 'DEFENSE':
        return this.fortLevel;
      case 'SENTRY':
        return this.fortLevel;
      case 'SPY':
        return this.fortLevel;
      default:
        return 0;
    }
  }

  /**
   * Calculates the total army stat for a given unit type, taking into account the units and weapons owned by the user.
   * @param type - The type of unit to calculate the army stat for.
   * @returns The total army stat for the given unit type.
   */
  getArmyStat(type: UnitType) {
    const Units = this.units?.filter((unit) => unit.type === type) || [];
    let totalStat = 0;

    Units.forEach((unit) => {
      // Get the unit's bonus
      const unitFiltered = UnitTypes.find(
        (unitType) => unitType.type === unit.type && unitType.fortLevel <= this.getLevelForUnit(type)
      );
      if (unitFiltered === undefined) return 0;
      // Add the unit's bonus to the total
      totalStat += (unitFiltered?.bonus || 0) * unit.quantity;

      // Initialize a count object for each item type
      const itemCounts = {};

      // Filter out the weapons that match the unit type and categorize them by type
      const matchingWeapons = this.items?.filter(
        (weapon) => weapon.usage === unit.type
      ) || [];

      matchingWeapons.forEach((weapon) => {
        // Initialize count for this weapon type if not already done
        itemCounts[weapon.type] = itemCounts[weapon.type] || 0;

        const weaponBonus = WeaponTypes.find(
          (w) => w.level === weapon.level && w.usage === unit.type && w.type === weapon.type
        )?.bonus || 0;

        // Calculate the bonus for this weapon, considering the unit quantity and type count
        const usableQuantity = Math.min(weapon.quantity, unit.quantity - itemCounts[weapon.type]);
        totalStat += weaponBonus * usableQuantity;

        // Update the count for this weapon type
        itemCounts[weapon.type] += usableQuantity;
      });
    });
    
    // Apply the appropriate bonus based on the type
    switch (type) {
      case 'OFFENSE':
        totalStat *= 1 + this.attackBonus / 100;
        break;
      case 'DEFENSE':
        totalStat *= 1 + this.defenseBonus / 100;
        break;
      case 'SPY':
        totalStat *= 1 + this.spyBonus / 100;
        break;
      case 'SENTRY':
        totalStat *= 1 + this.sentryBonus / 100;
        break;
      default:
        break;
    }

    return Math.ceil(totalStat);
  }


  /**
   * Returns the offense army stat of the user.
   * @returns {number} The offense army stat of the user.
   */
  get offense(): number {
    return this.getArmyStat('OFFENSE');
  }

  /**
   * Returns the defense stat of the user's army.
   * @returns {number} The defense stat of the user's army.
   */
  get defense(): number {
    return this.getArmyStat('DEFENSE');
  }

  /**
   * Returns the value of the SENTRY army stat for the user.
   * @returns {number} The value of the SENTRY army stat.
   */
  get sentry(): number {
    return this.getArmyStat('SENTRY');
  }

  /**
   * Returns the SPY army stat of the user.
   * @returns {number} The SPY army stat of the user.
   */
  get spy(): number {
    return this.getArmyStat('SPY');
  }

  /**
   * Determines if the user can attack a certain level based on their experience.
   * @param level - The level to check if the user can attack.
   * @returns True if the user can attack the level, false otherwise.
   */
  canAttack(level: number): boolean {
    return (
      this.getLevelFromXP(this.experience) >= level - 5 &&
      this.getLevelFromXP(this.experience) <= level + 5
    );
  }

  /**
   * Returns an object containing the total number of units for each type and the number of untrained citizens.
   * @returns {UnitTotalsType} An object containing the total number of units for each type and the number of untrained citizens.
   */
  get unitTotals(): UnitTotalsType {
    const { units } = this;
    const untrained = this.citizens;
    const workers = units
      .filter((unitgroup) => unitgroup.type === 'WORKER')
      .map((unit) => unit.quantity)
      .reduce((acc, quant) => acc + quant, 0);
    const offense = units
      .filter((unitgroup) => unitgroup.type === 'OFFENSE')
      .map((unit) => unit.quantity)
      .reduce((acc, quant) => acc + quant, 0);
    const defense = units
      .filter((unitgroup) => unitgroup.type === 'DEFENSE')
      .map((unit) => unit.quantity)
      .reduce((acc, quant) => acc + quant, 0);
    const spies = units
      .filter((unitgroup) => unitgroup.type === 'SPY')
      .map((unit) => unit.quantity)
      .reduce((acc, quant) => acc + quant, 0);
    const sentries = units
      .filter((unitgroup) => unitgroup.type === 'SENTRY')
      .map((unit) => unit.quantity)
      .reduce((acc, quant) => acc + quant, 0);
    return {
      citizens: untrained,
      workers,
      offense,
      defense,
      spies,
      sentries,
    };
  }

  /**
   * Returns the level of the user based on their experience points.
   * If the user has 0 experience points, their level is 1.
   * @returns The level of the user.
   */
  get level(): number {
    if (this.experience === 0) return 1;

    return this.getLevelFromXP(this.experience);
  }

  xpRequiredForLevel(level: number): number {
    const levelInfo = levelXPArray.find(l => l.level === level);
    return levelInfo ? levelInfo.xp : Math.floor(level ** 2.5 * 1000); // Fallback to formula if level not in array
  }

  /**
   * Calculates the level of a user based on their XP using the levelXPArray.
   * @param xp - The amount of XP the user has.
   * @returns The user's level.
   */
  getLevelFromXP(xp: number): number {
    for (let i = 0; i < levelXPArray.length; i++) {
      if (xp < levelXPArray[i].xp) {
        return levelXPArray[i].level - 1;
      }
    }
    return levelXPArray[levelXPArray.length - 1].level; // Return max level if XP exceeds all defined levels
  }

  /**
   * Calculates the amount of experience points required to reach the next level using the levelXPArray.
   * @param currentLevel - The current level of the user.
   * @param currentXP - The current XP of the user.
   * @returns The amount of experience points required to reach the next level.
   */
  get xpToNextLevel(): number {
    const nextLevelInfo = levelXPArray.find(l => l.level === this.level + 1);
    return nextLevelInfo ? nextLevelInfo.xp - this.experience : 0;
  }

  /**
   * Returns an object containing the current and maximum fort health, as well as the percentage of current health relative to maximum health.
   * If the fort level is not defined, returns an object with all values set to 0.
   * @returns {FortHealth} An object containing the current and maximum fort health, as well as the percentage of current health relative to maximum health.
   */
  get fortHealth(): FortHealth {
    if (!this.fortLevel) return { current: 0, max: 0, percentage: 0 };

    return {
      current: this.fortHitpoints,
      max: Fortifications[this.fortLevel].hitpoints,
      percentage: Math.floor(
        (this.fortHitpoints / Fortifications[this.fortLevel].hitpoints) * 100
      ),
    };
  }

  /**
   * Increases the level of a given stat by 1. Returns the entire object.
   * @param {string} type - The type of stat to increase.
   */
  increaseStatLevel(type: string) {
    return this.structure_upgrades.map(stat => {
      if (stat.type === type) {
        return { ...stat, level: stat.level + 1 };
      }
      return stat;
    });
  }

  // https://www.sitepoint.com/build-javascript-countdown-timer-no-dependencies/
  /**
   * Calculates the time remaining between the current time and a given end time.
   * @param {string} endtime - The end time to calculate the time remaining until.
   * @returns {Object} An object containing the total time remaining in milliseconds, as well as the number of days, hours, minutes, and seconds remaining.
   */
  getTimeRemaining(endtime: string) {
    const total = Date.parse(endtime) - new Date().getTime();
    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const days = Math.floor(total / (1000 * 60 * 60 * 24));

    return {
      total,
      days,
      hours,
      minutes,
      seconds,
    };
  }

  /**
   * Calculates the time to the next turn based on the current date.
   * @param date - The current date. Defaults to the current time.
   * @returns The time of the next turn.
   */
  getTimeToNextTurn(date = new Date()) {
    const ms = 1800000; // 30mins in ms
    const nextTurn = new Date(Math.ceil(date.getTime() / ms) * ms);
    return nextTurn;
  }

  
  /**
   * Returns an array of available unit types based on the user's fort level.
   * @returns {Unit[]} An array of available unit types.
   */
  get availableUnitTypes(): Unit[] {
    return UnitTypes.filter((unitType) => (unitType.type === 'OFFENSE' ? unitType.fortLevel <= this.offensiveLevel + 8 :
     unitType.type === 'DEFENSE' ? unitType.fortLevel <= this.fortLevel + 8 :
      unitType.level <= this.fortLevel + 1));
  }

  /**
   * Returns an array of available weapons based on the user's fort level.
   * @returns {Weapon[]} An array of available weapons.
   */
  get availableItemTypes(): Weapon[] {
    return WeaponTypes.filter(
      (unitType) => unitType.level <= this.fortLevel + 1
    );
  }

  /**
   * Returns an array of fortifications that are available to the user based on their fortification level.
   * @returns {Fortification[]} An array of fortifications.
   */
  get availableFortifications(): Fortification[] {
    return Fortifications.filter((fort) => fort.level <= this.fortLevel + 2);
  }

  /**
   * Returns an array of available defensive upgrades based on the user's fort level.
   * @returns {DefensiveUpgradeType[]} An array of available defensive upgrades.
   */
  get availableDefenseBattleUpgrades(): DefensiveUpgradeType[] {
    return DefenseiveUpgrades.filter(
      (fort) => fort.fortLevelRequirement <= this.fortLevel + 1
    );
  }

  /**
   * Returns an array of available offensive battle upgrades based on the user's fort level.
   * @returns {OffensiveUpgradeType[]} An array of available offensive battle upgrades.
   */
  get availableOffenseBattleUpgrades(): OffensiveUpgradeType[] {
    return BattleUpgrades.filter(
      (fort) => fort.StructureUpgradeLevelRequired <= this.offensiveLevel + 5 && fort.type === 'OFFENSE'
    );
  }

  /**
   * Returns an array of available spy battle upgrades based on the user's fort level.
   * @returns {SpyUpgradeType[]} An array of available spy battle upgrades.
   */
  get availableSpyBattleUpgrades(): SpyUpgradeType[] {
    return SpyUpgrades.filter(
      (fort) => fort.fortLevelRequirement <= this.fortLevel + 1
    );
  }
  
  /**
   * Returns an array of SentryUpgradeType objects that are available for the user to upgrade their sentry battle.
   * @returns {SentryUpgradeType[]} An array of SentryUpgradeType objects.
   */
  get availableSentryBattleUpgrades(): SentryUpgradeType[] {
    return SentryUpgrades.filter(
      (fort) => fort.fortLevelRequirement <= this.fortLevel + 1
    );
  }

  /**
   * Returns the maximum number of deposits in a 24hr period
   * @returns {number}
   */
  get maximumBankDeposits(): number {
    const max = EconomyUpgrades[this.economyLevel]?.depositsPerDay || 0;
    return max;
  }

  get armoryLevel(): number {
    return this.structure_upgrades.find((struc)=> struc.type === 'ARMORY').level || 0;
  }

  get offensiveLevel(): number {
    return this.structure_upgrades.find((struc)=> struc.type === 'OFFENSE').level || 0;
  }

  get spyLevel(): number {
    return this.structure_upgrades.find((struc)=> struc.type === 'SPY').level || 0;
  }

  get sentryLevel(): number {
    return this.structure_upgrades.find((struc)=> struc.type === 'SENTRY').level || 0;
  }

}

export default UserModel;
