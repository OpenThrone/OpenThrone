import md5 from 'md5';
import { getAssetPath } from '@/utils/utilities';

import type {
  BonusPointsItem,
  FortHealth,
  Fortification,
  Locales,
  PlayerClass,
  PlayerRace,
  PlayerUnit,
  Unit,
  UnitTotalsType,
  UnitType,
  Item,
  ItemCounts,
  UnitUpgradeType,
  PlayerBonus,
} from '@/types/typings';

import {
  BattleUpgrades,
  Bonuses,
  EconomyUpgrades,
  Fortifications,
  HouseUpgrades,
  OffensiveUpgrades,
  SentryUpgrades,
  SpyUpgrades,
  UnitTypes,
  ItemTypes,
  levelXPArray,
} from '../constants';
import { getLevelFromXP } from '@/utils/utilities';
import { stringifyObj } from '@/utils/numberFormatting';

class UserModel {
  public id: number;

  public displayName: string;

  public email: string;

  public passwordHash: string;

  public race: PlayerRace;

  public class: PlayerClass;

  public experience: number;

  public gold: bigint | string;

  public goldInBank: bigint | string;

  public fortLevel: number;

  public fortHitpoints: number;

  public houseLevel: number;

  public attackTurns: number;

  public units: PlayerUnit[];

  public items: Item[];

  public last_active: Date;

  public bio: string;

  public colorScheme: PlayerRace | string;

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

  public detectedSpy: boolean;

  public locale: Locales; 

  public avatar: string;

  public battle_upgrades: UnitUpgradeType[] | [];
  public stats: any[];
  
  public won_attacks: number;
  
  public won_defends: number;
  
  public totalAttacks: number;
  
  public totalDefends: number;
  
  public currentStatus: string;
  
  public offense: number;
  
  public defense: number;
  
  public spy: number;
  
  public sentry: number;
  
  public permissions: any[];

  public offense: number;

  public defense: number;

  public spy: number;

  public sentry: number;

  constructor(userData?: any, filtered: boolean = true, checkStats: boolean = true) {
    userData = JSON.parse(JSON.stringify(stringifyObj(userData)));
    this.id = 0;
    this.displayName = '';
    this.email = '';
    this.passwordHash = '';
    this.race = 'ELF';
    this.class = 'ASSASSIN';
    this.experience = 0;
    this.gold = '0';
    this.goldInBank = '0';

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
    this.detectedSpy = false;
    this.structure_upgrades = [];
    this.battle_upgrades = [];
    this.locale = 'en-US';
    this.avatar = '';
    this.won_attacks = 0;
    this.won_defends = 0;
    this.totalAttacks = 0;
    this.totalDefends = 0;
    this.currentStatus = '';
    this.permissions = [];
    if (userData) {
      this.id = userData.id;
      this.displayName = userData.display_name;
      if (!filtered) {
        this.email = userData.email;
        this.passwordHash = userData?.password_hash;
        this.goldInBank = userData.gold_in_bank;
      }
      this.economyLevel = userData.economy_level;
      const nowdate = new Date();
      const lastActiveTimestamp = new Date(userData.last_active).getTime();
      const nowTimestamp = nowdate.getTime();

      this.is_online = (nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15;
      this.attackTurns = userData.attack_turns;
      this.race = userData.race;
      this.class = userData.class;
      this.experience = userData.experience;
      this.gold = userData.gold || '0';
      this.goldInBank = userData.gold_in_bank || '0';
      this.battle_upgrades = userData.battle_upgrades;
      this.fortLevel = userData.fort_level;
      this.fortHitpoints = userData?.fort_hitpoints || userData?.fortHitpoints || 0;
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
      this.attacks_won = userData.won_attacks || 0;
      this.defends_won = userData.won_defends || 0;
      this.totalAttacks = userData.totalAttacks || 0;
      this.totalDefends = userData.totalDefends || 0;
      this.currentStatus = userData.currentStatus || '';
      this.stats = userData.stats;
      this.structure_upgrades = userData.structure_upgrades;
      this.locale = userData.locale;
      this.offense = userData.offense;
      this.defense = userData.defense;
      this.spy = userData.spy;
      this.sentry = userData.sentry;
      if(userData.avatar !== 'SHIELD') {
        this.avatar = userData.avatar;
      } else {
        this.avatar = getAssetPath('shields', '150x150', this.race)
      }

      this.permissions = userData.permissions;
    }
    if (checkStats)
      this.updateStats()
  }

  updateStats() {
    this.offense = this.getArmyStat('OFFENSE');
    this.defense = this.getArmyStat('DEFENSE');
    this.spy = this.getArmyStat('SPY');
    this.sentry = this.getArmyStat('SENTRY');
  }

  get attacksWon(): number {
    return this.attacks_won;
  }

  get defendsWon(): number {
    return this.defends_won;
  }

  statistics(type: string, subType: string): number {
    // Return 0 for unsupported types or subtypes
    if (!['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].includes(type) ||
      !['WON', 'LOST'].includes(subType)) {
      return 0;
    }
    if (this.stats?.length === 0 || !this.stats) {
      return 0;
    }
    return this.stats.find(stat => stat.type === type && stat.subtype === subType)?.stat || 0;
  }

  get netWorth(): BigInt | number {
    return BigInt(this.gold) + BigInt(this.goldInBank);
  }

  /**
   * Returns the number of available proficiency points for the user.
   * This is calculated by subtracting the sum of bonus points' levels from the user's level.
   * @returns {number} The number of available proficiency points.
   */
  get availableProficiencyPoints(): number {
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
  get usedProficiencyPoints(): number {
    return (
      this.bonus_points.reduce((acc, bonus) => acc + bonus.level, 0)
    );
  }

  /**
   * Returns an array of bonuses that are applicable to the user's race or class.
   * @returns {Array<PlayerBonus>} An array of Bonus objects.
   */
  get playerBonuses(): PlayerBonus[] {
    return Bonuses.filter(
      (bonus) => bonus.race === this.race || bonus.race === this.class
    );
  }

  /**
   * Calculates the total income bonus for the user based on their race, class, and bonus points.
   * @returns The total income bonus for the user.
   */
  get incomeBonus(): number {
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
  get recruitingLink(): string {
    return md5(this.id.toString());
  }

  /**
   * Returns the total attack bonus for the user.
   * @returns {number} The total attack bonus.
   */
  get attackBonus(): number {
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
    const siegeUpgradeBonus = OffensiveUpgrades.filter(
      (upgrade) => upgrade.level === this.structure_upgrades.find((upgrade) => upgrade.type === 'OFFENSE')?.level
    ).reduce((acc, upgrade) => acc + upgrade.offenseBonusPercentage, 0);
    
    return attack + offenseLevelBonus + siegeUpgradeBonus;
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
    const fortBonus = Fortifications.find(x => x.level === this.fortLevel)?.defenseBonusPercentage || 0;
    return defense + defenseLevelBonus + fortBonus;
  }

  /**
   * Calculates the total intelligence bonus for the user.
   * @returns {number} The total intelligence bonus.
   */
  get intelBonus(): number {
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

  get spyBonus(): number {
    return SpyUpgrades[this?.spyLevel].offenseBonusPercentage + this.intelBonus;
  }

  get sentryBonus(): number {
    return SentryUpgrades[this?.sentryLevel].defenseBonusPercentage + this.intelBonus;
  }

  /**
  * Returns the missions that are enabled for the user based on their level.
  * @returns {Object} An object containing the enabled missions.
  */
  get spyMissions(): any { //TODO: fix any type for spyMissions
    const missions = [
      { name: 'infil', requiredLevel: 7 },
      { name: 'assass', requiredLevel: 16 },
      { name: 'intel', requiredLevel: 0 },
    ];

    return missions.reduce((availableMissions, mission) => {
      availableMissions[mission.name] = {
        enabled: this.spyLevel >= mission.requiredLevel,
        requiredLevel: mission.requiredLevel
      };
      return availableMissions;
    }, {});
  }

  get spyLimits(): any { //TODO: fix any type for spyLimits
    return {
      infil: {
        perUser: SpyUpgrades[this?.spyLevel].maxInfiltratorsPerUser,
        perMission: SpyUpgrades[this?.spyLevel].maxInfiltratorsPerMission,
        perDay: SpyUpgrades[this?.spyLevel].maxInfiltrations,
      },
      assass: {
        perDay: SpyUpgrades[this?.spyLevel]?.maxAssassinations,
        perMission: SpyUpgrades[this?.spyLevel]?.maxAssassinsPerMission,
        perUser: SpyUpgrades[this?.spyLevel]?.maxAssassinationsPerUser,
      },
      stats: {
        level: this?.spyLevel,
        all: SpyUpgrades[this?.spyLevel]
      }
    }
  }

  /**
   * Returns the total recruiting bonus for the user.
   * @returns {number} The total recruiting bonus.
   */
  get recruitingBonus(): number {
    const recruiting = Bonuses.filter(
      (bonus) =>
        (bonus.race === this.race || bonus.race === this.class) &&
        bonus.bonusType === 'RECRUITING'
    ).reduce(function (count, stat) {
      return count + stat.bonusAmount;
    }, 0);
    const houseBonus = HouseUpgrades[this.houseLevel as keyof typeof HouseUpgrades].citizensDaily;
    return recruiting + houseBonus;
  }

  /**
   * Returns the total casualty bonus for the user based on their race and class.
   * @returns {number} The total casualty bonus.
   */
  get casualtyBonus(): number {
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
  get priceBonus(): number {
    const price = Bonuses.filter(
      (bonus) =>
        (bonus.race === this.race || bonus.race === this.class) &&
        bonus.bonusType === 'PRICES'
    ).reduce(function (count, stat) {
      return count + stat.bonusAmount;
    }, 0);
    return price + (this.bonus_points.find((bonus) => bonus.type === 'PRICES')?.level || 0);
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
  get population(): number {
    return this.units.reduce((acc, unit) => acc + unit.quantity, 0);
  }

  /**
   * Returns the number of citizens in the units array.
   * @returns {number} The number of citizens.
   */
  get citizens(): number {
    return this.units.find((unit) => unit.type === 'CITIZEN')?.quantity || 0;
  }

  /**
   * Returns the total gold per turn for the user, calculated based on the number of worker units and fortification level.
   * @returns The total gold per turn for the user.
   */
  get goldPerTurn(): BigInt {
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
      Fortifications.find((fort) => fort.level === this.fortLevel)?.goldPerTurn;
    return BigInt(Math.ceil(workerGoldPerTurn + fortificationGoldPerTurn + (this.incomeBonus / 100 * (workerGoldPerTurn + fortificationGoldPerTurn))));
  }

  /**
   * Returns the amount of gold earned per turn based on the current fortification level.
   * @returns {number} The amount of gold earned per turn.
   */
  get fortificationGoldPerTurn(): number {
    return Fortifications.find((fort) => fort.level === this.fortLevel)?.goldPerTurn || 0;
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

    let workerBonus = 50;

    const upgrade = EconomyUpgrades[this.economyLevel as keyof typeof EconomyUpgrades];

    if (typeof upgrade === 'object' && 'goldPerWorker' in upgrade) {
      workerBonus = upgrade.goldPerWorker;
    }

    // Calculate the bonus per worker after considering incomeBonus.
    const workerGoldPerTurn = workerBonus ? workerBonus * (1 + parseInt(this.incomeBonus.toString(), 10) / 100) : 0;

    return workerGoldPerTurn;
  }

  getLevelForUnit(type: UnitType): number {
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
        return 1;
    }
  }

  /**
 * Calculates the total army stat for a given unit type, considering units and weapons owned by the user.
 * @param type - The type of unit to calculate the army stat for.
 * @returns The total army stat for the given unit type.
 */
  getArmyStat(type: UnitType): number {
    const sortedItems = this.getSortedItems(type);
    const sortedUnits = this.getSortedUnits(type);
    let totalStat = 0;
    const unitCoverage = new Map<number, number>(); // Keeps track of coverage

    totalStat += this.calculateUnitStats(sortedUnits, unitCoverage);
    totalStat += this.calculateItemStats(sortedItems, sortedUnits, unitCoverage);

    // Calculate bonuses from upgrades
    sortedUnits.forEach((unit, index) => {
      const applicableUpgrades = this.getApplicableUpgrades(unit, type);

      applicableUpgrades.forEach(upgrade => {
        // Clone userUpgrade for this calculation to avoid side effects
        const userUpgrade = { ...this.getUserUpgrade(upgrade, type) };

        if (userUpgrade && userUpgrade.quantity > 0) {
          const { totalBonusForUnits, unitsCovered } = this.calculateUpgradeBonus(upgrade, unit, userUpgrade, unitCoverage, index);
          totalStat += totalBonusForUnits;

          // Use a local variable instead of modifying userUpgrade.quantity directly
          const remainingQuantity = userUpgrade.quantity - Math.ceil(unitsCovered / upgrade.unitsCovered);

          // Update unit coverage without modifying external state
          unitCoverage.set(index, (unitCoverage.get(index) || 0) + unitsCovered);
        }
      });
    });

    totalStat = this.applyBonuses(type, totalStat);
    return Math.ceil(totalStat);
  }


  /**
   * Sorts and filters items based on type.
   * @param type - The type of unit.
   * @returns Sorted items.
   */
  private getSortedItems(type: UnitType): Item[] {
    const filteredItems = this.items.filter(item => item.usage === type).sort((a, b) => b.level - a.level);
    if(filteredItems.length > 0)
      return JSON.parse(JSON.stringify(filteredItems));
    
    return []
  }

  /**
   * Sorts and filters units based on type.
   * @param type - The type of unit.
   * @returns Sorted units.
   */
  private getSortedUnits(type: UnitType): PlayerUnit[] {
    return JSON.parse(JSON.stringify(this.units.filter(unit => unit.type === type).sort((a, b) => b.level - a.level)));
  }

  /**
   * Calculates the total stats from units.
   * @param sortedUnits - Sorted units.
   * @param unitCoverage - Map tracking unit coverage.
   * @returns Total unit stats.
   */
  private calculateUnitStats(sortedUnits: PlayerUnit[], unitCoverage: Map<number, number>): number {
    let totalStat = 0;

    sortedUnits.forEach((unit, index) => {
      const unitFiltered = UnitTypes.find((unitType) => unitType.type === unit.type && unitType.level === unit.level);
      if (!unitFiltered) return 0;

      totalStat += (unitFiltered.bonus || 0) * unit.quantity;
    });

    return totalStat;
  }

  /**
   * Calculates the total stats from items.
   * @param sortedItems - Sorted items.
   * @param sortedUnits - Sorted units.
   * @param unitCoverage - Map tracking unit coverage.
   * @returns Total item stats.
   */
  private calculateItemStats(sortedItems: Item[], sortedUnits: UnitUpgradeType[], unitCoverage: Map<number, number>): number {
    let totalStat = 0;

    sortedUnits.forEach((unit, index) => {
      const itemCounts: ItemCounts = {};
      sortedItems.forEach((item) => {
        itemCounts[item.type] = itemCounts[item.type] || 0;
        const weaponBonus = ItemTypes.find((w) => w.level === item.level && w.usage === unit.type && w.type === item.type)?.bonus || 0;
        const usableQuantity = Math.min(item.quantity, unit.quantity - itemCounts[item.type]);
        totalStat += weaponBonus * usableQuantity;
        item.quantity -= usableQuantity;
        itemCounts[item.type] += usableQuantity;
      });
    });

    return totalStat;
  }

  /**
   * Gets the applicable upgrades based on unit type.
   * @param unit - The unit.
   * @param type - The unit type.
   * @returns Applicable upgrades.
   */
  private getApplicableUpgrades(unit: Unit, type: UnitType): any[] | UnitUpgradeType[] {
    switch (type) {
      case 'DEFENSE':
        return this.availableDefenseBattleUpgrades.filter(upgrade => unit.level >= upgrade.minUnitLevel).sort((a, b) => b.level - a.level);
      case 'OFFENSE':
        return this.availableOffenseBattleUpgrades.filter(upgrade => unit.level >= upgrade.minUnitLevel).sort((a, b) => b.level - a.level);
      case 'SPY':
        return this.availableSpyBattleUpgrades.sort((a, b) => b.level - a.level);
      case 'SENTRY':
        return this.availableSentryBattleUpgrades.sort((a, b) => b.level - a.level);
      default:
        return [];
    }
  }

  /**
   * Gets the user upgrade for the specified type and level.
   * @param upgrade - The upgrade.
   * @param type - The unit type.
   * @returns The user upgrade.
   */
  private getUserUpgrade(upgrade: UnitUpgradeType | any, type: UnitType): UnitUpgradeType | undefined {
    return this.battle_upgrades.find(u => (u as any)?.level === (upgrade as any)?.level && (u as any)?.type === (upgrade as any)?.type);
  }

  /**
   * Calculates the bonus from the upgrade.
   * @param upgrade - The upgrade.
   * @param unit - The unit.
   * @param userUpgrade - The user upgrade.
   * @param unitCoverage - Map tracking unit coverage.
   * @param index - Index of the unit.
   * @returns Total bonus and units covered.
   */
  private calculateUpgradeBonus(upgrade: UnitUpgradeType, unit: UnitUpgradeType, userUpgrade: UnitUpgradeType, unitCoverage: Map<number, number>, index: number): { totalBonusForUnits: number, unitsCovered: number } {
    const bonusPerUnit = upgrade.bonus;
    const remainingCoverage = unit.quantity - (unitCoverage.get(index) || 0);
    const unitsCovered = Math.min(remainingCoverage, userUpgrade.quantity * upgrade.unitsCovered);
    const totalBonusForUnits = bonusPerUnit * unitsCovered;

    return { totalBonusForUnits, unitsCovered };
  }

  /**
   * Applies bonuses based on unit type.
   * @param type - The unit type.
   * @param totalStat - The total stat to adjust.
   * @returns Adjusted total stat.
   */
  private applyBonuses(type: UnitType, totalStat: number): number {
    switch (type) {
      case 'OFFENSE':
        return totalStat * (1 + this.attackBonus / 100);
      case 'DEFENSE':
        return totalStat * (1 + this.defenseBonus / 100);
      case 'SPY':
        return totalStat * (1 + this.spyBonus / 100);
      case 'SENTRY':
        return totalStat * (1 + this.sentryBonus / 100);
      default:
        return totalStat;
    }
  }


  /**
   * Determines if the user can attack a certain level based on their experience.
   * @param level - The level to check if the user can attack.
   * @returns True if the user can attack the level, false otherwise.
   */
  canAttack(level: number): boolean {
    return (
      getLevelFromXP(this.experience) >= level - parseInt(process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE || '5', 10) && 
      getLevelFromXP(this.experience) <= level + parseInt(process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE || '5', 10) 
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
    const assassins = units
      .filter((unitgroup) => unitgroup.type === 'SPY' && unitgroup.level === 3)
      .map((unit) => unit.quantity)
      .reduce((acc, quant) => acc + quant, 0);
    const infiltrators = units
      .filter((unitgroup) => unitgroup.type === 'SPY' && unitgroup.level === 2)
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
      assassins,
      infiltrators,
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

    return getLevelFromXP(this.experience);
  }

  /**
   * Returns the amount of experience points required to reach the next level.
   * @returns The amount of experience points required to reach the next level.
   */
  xpRequiredForLevel(level: number): number {
    const levelInfo = levelXPArray.find(l => l.level === level);
    return levelInfo ? levelInfo.xp : Math.floor(level ** 2.5 * 1000); // Fallback to formula if level not in array
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
      max: Fortifications[this.fortLevel-1].hitpoints,
      percentage: Math.floor(
        (this.fortHitpoints / Fortifications.find((fort) => fort.level === this.fortLevel).hitpoints) * 100
      ),
    };
  }

  /**
   * Increases the level of a given stat by 1. Returns the entire object.
   * @param {string} type - The type of stat to increase.
   */
  increaseStatLevel(type: string): any[] {
    return this.structure_upgrades.map(stat => {
      if (stat.type === type) {
        return { ...stat, level: stat.level + 1 };
      }
      return stat;
    });
  }

  /**
   * Calculates the time to the next turn based on the current date.
   * @param date - The current date. Defaults to the current time.
   * @returns The time of the next turn.
   */
  getTimeToNextTurn(date = new Date()): Date {
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
   * @returns {Item[]} An array of available weapons.
   */
  get availableItemTypes(): Item[] {
    return ItemTypes.filter(
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
   * @returns {UnitUpgradeType[]} An array of available defensive upgrades.
   */
  get availableDefenseBattleUpgrades(): UnitUpgradeType[] {
    return BattleUpgrades.filter(
      (fort) => fort.SiegeUpgradeLevel <= this.offensiveLevel + 1 && fort.type === 'DEFENSE'
    );
  }

  /**
   * Returns an array of available offensive battle upgrades based on the user's fort level.
   * @returns {UnitUpgradeType[]} An array of available offensive battle upgrades.
   */
  get availableOffenseBattleUpgrades(): UnitUpgradeType[] {
    return BattleUpgrades.filter(
      (fort) => fort.SiegeUpgradeLevel <= this.offensiveLevel + 5 && fort.type === 'OFFENSE'
    );
  }

  /**
   * Returns an array of available spy battle upgrades based on the user's fort level.
   * @returns {UnitUpgradeType[]} An array of available spy battle upgrades.
   */
  get availableSpyBattleUpgrades(): UnitUpgradeType[] {
    return BattleUpgrades.filter(
      (fort) => fort.SiegeUpgradeLevel <= this.fortLevel + 1 && fort.type === 'SPY'
    );
  }
  
  /**
   * Returns an array of SentryUpgradeType objects that are available for the user to upgrade their sentry battle.
   * @returns {UnitUpgradeType[]} An array of SentryUpgradeType objects.
   */
  get availableSentryBattleUpgrades(): UnitUpgradeType[] {
    return BattleUpgrades.filter(
      (fort) => fort.SiegeUpgradeLevel <= this.fortLevel + 1 && fort.type === 'SENTRY'
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
    return this.structure_upgrades.find((struc)=> struc.type === 'ARMORY')?.level || 0;
  }

  get offensiveLevel(): number {
    return this.structure_upgrades.find((struc)=> struc.type === 'OFFENSE')?.level || 0;
  }

  get spyLevel(): number {
    return this.structure_upgrades.find((struc)=> struc.type === 'SPY')?.level || 0;
  }

  get sentryLevel(): number {
    return this.structure_upgrades.find((struc)=> struc.type === 'SENTRY')?.level || 0;
  }

  get attackRange(): {
    min: number;
    max: number;
  } {
    return {
      min: Math.max(1, this.level - 5), //min is 1 or 5 levels below current level
      max: this.level + 5, //max is 5 levels above current level
    };
  }

}

export default UserModel;
