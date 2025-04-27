import md5 from 'md5';
import { getAssetPath } from '@/utils/utilities';
import { users as PrismaUser, PermissionType, AccountStatus } from '@prisma/client'; // Correct Prisma type import

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
  PlayerItem,
  PlayerBattleUpgrade,
  StructureUpgrade,
  PlayerStat,
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
import { logDebug } from '@/utils/logger';

/**
 * Represents a User, providing methods to access calculated stats, bonuses,
 * available units/items, and other derived properties based on the raw user data.
 */
class UserModel {
  /** User's unique ID. */
  public id: number;
  /** User's chosen display name. */
  public displayName: string;
  /** User's email address (may be filtered). */
  public email: string;
  /** User's hashed password (may be filtered). */
  public passwordHash: string;
  /** User's selected race. */
  public race: PlayerRace;
  /** User's selected class. */
  public class: PlayerClass;
  /** User's current experience points. */
  public experience: number;
  /** User's gold on hand. */
  public gold: bigint;
  /** User's gold in the bank (may be filtered). */
  public goldInBank: bigint;
  /** User's current fortification level. */
  public fortLevel: number;
  /** User's current fortification hitpoints. */
  public fortHitpoints: number;
  /** User's current house level. */
  public houseLevel: number;
  /** User's remaining attack turns. */
  public attackTurns: number;
  /** Array of units owned by the user. */
  public units: PlayerUnit[];
  /** Array of items owned by the user. */
  public items: PlayerItem[];
  /** Timestamp of the user's last activity. */
  public last_active: Date | null;
  /** User's profile biography. */
  public bio: string;
  /** User's selected color scheme (can be race name or custom string). */
  public colorScheme: PlayerRace | string | null;
  /** Indicates if this model represents the currently logged-in player (usually set externally). */
  public is_player: boolean;
  /** Indicates if the user is currently considered online (based on last_active). */
  public is_online: boolean;
  /** User's overall rank (may be based on different criteria). */
  public overallrank: number;
  /** Total attacks made by the user (calculated from stats). */
  public attacks_made: number;
  /** Total times the user has defended against attacks (calculated from stats). */
  public attacks_defended: number;
  /** Total attacks won by the user (calculated from stats). */
  public attacks_won: number;
  /** Total defenses won by the user (calculated from stats). */
  public defends_won: number;
  /** Array of bonus points allocated by the user. */
  public bonus_points: BonusPointsItem[];
  /** User's current economy structure level. */
  public economyLevel: number;
  /** Array of structure upgrades owned by the user. */
  public structure_upgrades: StructureUpgrade[];
  /** Array of battle upgrades owned by the user. */
  public battle_upgrades: PlayerBattleUpgrade[];
  /** Array of user statistics (e.g., attacks won/lost). */
  public stats: PlayerStat[];
  /** Flag indicating if the user has been attacked recently (usually set externally). */
  public beenAttacked: boolean;
  /** Flag indicating if the user has detected a spy recently (usually set externally). */
  public detectedSpy: boolean;
  /** User's preferred locale (e.g., 'en-US'). */
  public locale: Locales;
  /** URL or identifier for the user's avatar image. */
  public avatar: string | null;
  /** Array of permissions granted to the user. */
  public permissions: { type: PermissionType }[]; // Use specific type if available
  /** User's current account status (e.g., 'ACTIVE', 'VACATION'). */
  public currentStatus: AccountStatus | string; // Allow string for flexibility if API adds more
  /** Calculated total offense strength. */
  public offense: number;
  /** Calculated total defense strength. */
  public defense: number;
  /** Calculated total spy strength. */
  public spy: number;
  /** Calculated total sentry strength. */
  public sentry: number;
  /** Internal flag to control initial stat calculation. */
  private checkStats: boolean;

  /**
   * Creates an instance of UserModel.
   * @param userData - Raw user data, typically from Prisma or an API response.
   * @param filtered - If true, sensitive fields like email, passwordHash, and goldInBank are omitted. Defaults to true.
   * @param checkStats - If true, calculates derived stats (offense, defense, etc.) upon initialization. Defaults to true.
   */
  constructor(userData?: PrismaUser | null, filtered: boolean = true, checkStats: boolean = true) {
    // Ensure userData is not null or undefined before processing
    // Stringify and parse to handle potential BigInt serialization issues from Prisma/API
    const safeUserData = userData ? JSON.parse(JSON.stringify(stringifyObj(userData))) : null;

    this.id = safeUserData?.id ?? 0;
    this.displayName = safeUserData?.display_name ?? '';
    this.email = ''; // Only set if not filtered
    this.passwordHash = ''; // Only set if not filtered
    this.race = safeUserData?.race ?? 'ELF';
    this.class = safeUserData?.class ?? 'ASSASSIN';
    this.experience = safeUserData?.experience ?? 0;
    this.gold = BigInt(safeUserData?.gold ?? '0'); // Default to BigInt(0)
    this.goldInBank = BigInt('0'); // Default to BigInt(0), potentially overwritten if not filtered
    this.checkStats = checkStats;
    this.fortLevel = safeUserData?.fort_level ?? 0;
    this.fortHitpoints = safeUserData?.fort_hitpoints ?? 0;
    this.houseLevel = safeUserData?.house_level ?? 0;
    this.attackTurns = safeUserData?.attack_turns ?? 0;
    this.last_active = safeUserData?.last_active ? new Date(safeUserData.last_active) : null;
    // Safely parse JSON fields, providing default empty arrays
    this.units = safeUserData?.units ?? [];
    this.items = safeUserData?.items ?? [];
    this.bio = safeUserData?.bio ?? '';
    this.colorScheme = safeUserData?.colorScheme ?? null;
    this.is_player = false; // Typically set based on comparison elsewhere
    this.is_online = false; // Calculated later
    this.overallrank = safeUserData?.rank ?? 0; // Use 'rank' from Prisma
    this.economyLevel = safeUserData?.economy_level ?? 0;
    this.bonus_points = safeUserData?.bonus_points ?? [];
    this.structure_upgrades = safeUserData?.structure_upgrades ?? [];
    this.battle_upgrades = safeUserData?.battle_upgrades ?? [];
    this.stats = safeUserData?.stats ?? [];
    this.locale = safeUserData?.locale ?? 'en-US';
    this.avatar = safeUserData?.avatar ?? null;
    this.permissions = safeUserData?.permissions ?? [];
    // Fields typically added by API/calculations, initialize defaults
    this.attacks_made = safeUserData?.totalAttacks ?? 0;
    this.attacks_defended = safeUserData?.totalDefends ?? 0;
    this.attacks_won = safeUserData?.won_attacks ?? 0;
    this.defends_won = safeUserData?.won_defends ?? 0;
    this.beenAttacked = safeUserData?.beenAttacked ?? false;
    this.detectedSpy = safeUserData?.detectedSpy ?? false;
    this.currentStatus = safeUserData?.currentStatus ?? 'ACTIVE';
    this.offense = safeUserData?.offense ?? 0;
    this.defense = safeUserData?.defense ?? 0;
    this.spy = safeUserData?.spy ?? 0;
    this.sentry = safeUserData?.sentry ?? 0;

    // Handle filtered data
    if (!filtered && safeUserData) {
      this.email = safeUserData.email;
      this.passwordHash = safeUserData.password_hash ?? '';
      this.goldInBank = BigInt(safeUserData.gold_in_bank ?? '0');
    }

    // Set avatar path correctly
    if (this.avatar && this.avatar !== 'SHIELD') {
      // Keep the provided avatar if it's not the default placeholder
    } else {
      this.avatar = getAssetPath('shields', '150x150', this.race); // Use getAssetPath for default
    }

    // Calculate online status
    if (this.last_active) {
      const nowTimestamp = new Date().getTime();
      const lastActiveTimestamp = this.last_active.getTime();
      this.is_online = (nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15; // Online if active within 15 minutes
    }

    // Calculate derived stats if requested
    if (checkStats) {
      this.updateStats();
    }
  }


  /** Recalculates derived army stats (offense, defense, spy, sentry). */
  updateStats() {
    this.offense = this.getArmyStat('OFFENSE');
    this.defense = this.getArmyStat('DEFENSE');
    this.spy = this.getArmyStat('SPY');
    this.sentry = this.getArmyStat('SENTRY');
  }

  /** Gets the number of attacks won from the stats array. */
  get attacksWon(): number {
    return this.statistics('OFFENSE', 'WON');
  }

  /** Gets the number of defenses won from the stats array. */
  get defendsWon(): number {
    return this.statistics('DEFENSE', 'WON');
  }

  /**
   * Retrieves a specific statistic value from the user's stats array.
   * @param type - The primary type of the statistic (e.g., 'OFFENSE', 'DEFENSE').
   * @param subType - The subtype of the statistic (e.g., 'WON', 'LOST').
   * @returns The value of the statistic, or 0 if not found.
   */
  statistics(type: PlayerStat['type'], subType: string): number {
    if (!this.stats) return 0;
    // Ensure stat value is treated as a number, default to 0 if null/undefined/not a number
    const statValue = this.stats.find(stat => stat.type === type && stat.subtype === subType)?.stat;
    return typeof statValue === 'number' ? statValue : 0;
  }

  /** Calculates the user's net worth (gold on hand + gold in bank). */
  get netWorth(): bigint {
    const goldOnHand = BigInt(this.gold || 0);
    const goldInBank = BigInt(this.goldInBank || 0);
    return goldOnHand + goldInBank;
  }

  /** Calculates the number of available proficiency points based on level and used points. */
  get availableProficiencyPoints(): number {
    if (!this.bonus_points) return this.level;
    return Math.max(0, this.level - this.usedProficiencyPoints); // Ensure non-negative
  }

  /** Calculates the total number of proficiency points used. */
  get usedProficiencyPoints(): number {
    if (!this.bonus_points) return 0;
    return (this.bonus_points || []).reduce((acc, bonus) => acc + (bonus.level || 0), 0);
  }


  /** Gets the applicable race and class bonuses for the user. */
  get playerBonuses(): PlayerBonus[] {
    return Bonuses.filter(
      (bonus) => bonus.race === this.race || bonus.race === this.class
    );
  }

  /** Calculates the total income bonus percentage (base + points). */
  get incomeBonus(): number {
    const baseBonus = (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'INCOME')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus = (this.bonus_points || [])
      .filter((bonus) => bonus.type === 'INCOME')
      .reduce((sum, bonus) => sum + (bonus.level || 0), 0);

    return baseBonus + pointsBonus;
  }


  /** Generates the user's unique recruitment link hash. */
  get recruitingLink(): string {
    return md5(this.id.toString());
  }

  /** Calculates the total attack bonus percentage (base + points + structure). */
  get attackBonus(): number {
    const baseBonus = (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'OFFENSE')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);
    logDebug(`UserModel.attackBonus: base bonus: ${baseBonus}`);

    const pointsBonus = (this.bonus_points || [])
      .filter((bonus) => bonus.type === 'OFFENSE')
      .reduce((sum, bonus) => sum + (bonus.level || 0), 0);
    logDebug(`UserModel.attackBonus: points bonus: ${pointsBonus}`);

    const structureBonus = (this.structure_upgrades || [])
      .filter(upgrade => upgrade.type === 'OFFENSE')
      .map(upgrade => OffensiveUpgrades.find(u => u.level === upgrade.level)?.offenseBonusPercentage ?? 0)
      .reduce((sum, bonus) => sum + bonus, 0);
    logDebug(`UserModel.attackBonus: structure bonus: ${structureBonus}`);

    return baseBonus + pointsBonus + structureBonus;
  }


  /** Calculates the total defense bonus percentage (base + points + fortification). */
  get defenseBonus(): number {
    const baseBonus = (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'DEFENSE')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus = (this.bonus_points || [])
      .filter((bonus) => bonus.type === 'DEFENSE')
      .reduce((sum, bonus) => sum + (bonus.level || 0), 0);

    const fortBonus = Fortifications.find(f => f.level === this.fortLevel)?.defenseBonusPercentage ?? 0;

    return baseBonus + pointsBonus + fortBonus;
  }


  /** Calculates the total intel bonus percentage (base + points). */
  get intelBonus(): number {
    const baseBonus = (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'INTEL')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus = (this.bonus_points || [])
      .filter((bonus) => bonus.type === 'INTEL')
      .reduce((sum, bonus) => sum + (bonus.level || 0), 0);

    return baseBonus + pointsBonus;
  }


  /** Calculates the total spy bonus percentage (structure + intel). */
  get spyBonus(): number {
    const spyLevel = this.spyLevel;
    const structureBonus = SpyUpgrades.find(u => u.level === spyLevel)?.offenseBonusPercentage ?? 0;
    return structureBonus + this.intelBonus;
  }

  /** Calculates the total sentry bonus percentage (structure + intel). */
  get sentryBonus(): number {
    const sentryLevel = this.sentryLevel;
    const structureBonus = SentryUpgrades.find(u => u.level === sentryLevel)?.defenseBonusPercentage ?? 0;
    return structureBonus + this.intelBonus;
  }

  /** Determines which spy missions are enabled based on spy structure level. */
  get spyMissions(): Record<string, { enabled: boolean; requiredLevel: number }> {
    const missions = [
      { name: 'intel', requiredLevel: SpyUpgrades[0]?.level ?? 1 }, // Level 1 req
      { name: 'infil', requiredLevel: SpyUpgrades.find(u => u.maxInfiltrations > 0)?.level ?? Infinity }, // Level that unlocks infiltration
      { name: 'assass', requiredLevel: SpyUpgrades.find(u => u.maxAssassinations > 0)?.level ?? Infinity }, // Level that unlocks assassination
    ];
    const spyLevel = this.spyLevel;

    return missions.reduce((acc, mission) => {
      acc[mission.name] = {
        enabled: spyLevel >= mission.requiredLevel,
        requiredLevel: mission.requiredLevel
      };
      return acc;
    }, {} as Record<string, { enabled: boolean; requiredLevel: number }>);
  }

  /** Gets the limits for spy missions based on the current spy structure level. */
  get spyLimits(): {
    infil: { perUser: number; perMission: number; perDay: number };
    assass: { perUser: number; perMission: number; perDay: number };
    stats: { level: number; all: typeof SpyUpgrades[number] | undefined } // Use specific type
  } {
    const spyLevel = this.spyLevel;
    const currentSpyUpgrade = SpyUpgrades.find((u) => u.level === spyLevel);

    return {
      infil: {
        perUser: currentSpyUpgrade?.maxInfiltratorsPerUser ?? 0,
        perMission: currentSpyUpgrade?.maxInfiltratorsPerMission ?? 0,
        perDay: currentSpyUpgrade?.maxInfiltrations ?? 0,
      },
      assass: {
        perUser: currentSpyUpgrade?.maxAssassinationsPerUser ?? 0,
        perMission: currentSpyUpgrade?.maxAssassinsPerMission ?? 0,
        perDay: currentSpyUpgrade?.maxAssassinations ?? 0,
      },
      stats: {
        level: spyLevel,
        all: currentSpyUpgrade // Contains all details for the current level
      }
    };
  }


  /** Calculates the total recruiting bonus (base + house). */
  get recruitingBonus(): number {
    const baseBonus = (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'RECRUITING')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const houseBonus = HouseUpgrades[this.houseLevel as keyof typeof HouseUpgrades]?.citizensDaily ?? 0;

    return baseBonus + houseBonus;
  }

  /** Calculates the total casualty reduction bonus percentage. */
  get casualtyBonus(): number {
    return (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'CASUALTY')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);
  }


  /** Calculates the total price reduction bonus percentage (base + points). */
  get priceBonus(): number {
    const baseBonus = (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'PRICES')
      .reduce((sum, bonus) => sum + (bonus.bonusAmount || 0), 0);

    const pointsBonus = (this.bonus_points || [])
      .filter((bonus) => bonus.type === 'PRICES')
      .reduce((sum, bonus) => sum + (bonus.level || 0), 0);

    return baseBonus + pointsBonus;
  }


  /** Calculates the total number of combat units (excluding citizens and workers). */
  get armySize(): number {
    return (this.units || [])
      .filter((unit) => unit.type !== 'CITIZEN' && unit.type !== 'WORKER')
      .reduce((acc, unit) => acc + (unit.quantity || 0), 0);
  }

  /** Calculates the total population (all units including citizens and workers). */
  get population(): number {
    return (this.units || []).reduce((acc, unit) => acc + (unit.quantity || 0), 0);
  }

  /** Gets the number of citizens owned. */
  get citizens(): number {
    return this.units?.find((unit) => unit.type === 'CITIZEN')?.quantity ?? 0;
  }

  /** Calculates the total gold generated per turn from workers and fortification, including bonuses. */
  get goldPerTurn(): bigint {
    const workerUnits = (this.units || []).filter((unit) => unit.type === 'WORKER');
    const economyUpgrade = EconomyUpgrades[this.economyLevel];
    const goldPerWorker = economyUpgrade?.goldPerWorker ?? 0;
    const incomeBonusPercent = this.incomeBonus;

    const workerGold = workerUnits.reduce((sum, unit) => {
      const baseWorkerGold = goldPerWorker * (unit.quantity ?? 0);
      const bonusGold = baseWorkerGold * (incomeBonusPercent / 100);
      return sum + baseWorkerGold + bonusGold;
    }, 0);

    const fortGold = Fortifications.find(f => f.level === this.fortLevel)?.goldPerTurn ?? 0;
    const fortBonusGold = fortGold * (incomeBonusPercent / 100);

    // Use Math.ceil on the final number before converting to BigInt
    return BigInt(Math.ceil(workerGold + fortGold + fortBonusGold));
  }


  /** Gets the base gold per turn generated by the current fortification level. */
  get fortificationGoldPerTurn(): number {
    return Fortifications.find((fort) => fort.level === this.fortLevel)?.goldPerTurn ?? 0;
  }

  /** Calculates the total gold generated per turn by workers, including income bonus. */
  get workerGoldPerTurn(): number {
    const workerUnits = (this.units || []).filter(unit => unit.type === 'WORKER');
    if (workerUnits.length === 0) return 0;

    const economyUpgrade = EconomyUpgrades[this.economyLevel];
    const goldPerWorkerBase = economyUpgrade?.goldPerWorker ?? 0;
    const incomeBonusPercent = this.incomeBonus;

    const totalGold = workerUnits.reduce((sum, unit) => {
      const baseGold = goldPerWorkerBase * (unit.quantity ?? 0);
      const bonusGold = baseGold * (incomeBonusPercent / 100);
      return sum + baseGold + bonusGold;
    }, 0);

    return totalGold; // Return as number
  }


  /** Calculates the gold generated per worker per turn, including income bonus. */
  get goldPerWorkerPerTurn(): number {
    const economyUpgrade = EconomyUpgrades[this.economyLevel];
    const goldPerWorkerBase = economyUpgrade?.goldPerWorker ?? 0;
    const incomeBonusPercent = this.incomeBonus;

    return goldPerWorkerBase * (1 + incomeBonusPercent / 100);
  }


  /**
   * Gets the required fortification level for a specific unit type.
   * @param type - The type of unit.
   * @returns The required fortification level, or 1 if not applicable.
   */
  getLevelForUnit(type: UnitType): number {
    // Return fortLevel if type is relevant, otherwise 1
    if (['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].includes(type)) {
      return this.fortLevel;
    }
    return 1; // Default level requirement
  }

  /**
   * Calculates the total army stat (e.g., offense, defense) for a given unit type,
   * considering units, items, battle upgrades, and bonuses.
   * @param type - The UnitType ('OFFENSE', 'DEFENSE', 'SPY', 'SENTRY') to calculate the stat for.
   * @returns The calculated army stat value, rounded up.
   */
  getArmyStat(type: UnitType): number {
    const sortedItems = this.getSortedItems(type);
    const sortedUnits = this.getSortedUnits(type);
    let totalStat = 0;
    const unitCoverage = new Map<number, number>(); // Tracks item/upgrade coverage per unit index

    totalStat += this.calculateUnitStats(sortedUnits);
    logDebug(`UserModel.getArmyStat: ${type} unit stats: ${totalStat}`);
    totalStat += this.calculateItemStats(sortedItems, sortedUnits, unitCoverage);
    logDebug(`UserModel.getArmyStat: ${type} item stats: ${totalStat}`);
    totalStat += this.calculateBattleUpgradeStats(sortedUnits, type, unitCoverage);
    logDebug(`UserModel.getArmyStat: ${type} battle upgrade stats: ${totalStat}`);

    totalStat = this.applyBonuses(type, totalStat);
    logDebug(`UserModel.getArmyStat: ${type} total stat after bonuses: ${totalStat}`);
    return Math.ceil(totalStat);
  }



  private getSortedItems(type: UnitType): PlayerItem[] {
    return JSON.parse(JSON.stringify(
      (this.items || []).filter(item => item.usage === type).sort((a, b) => b.level - a.level)
    ));
  }

  private getSortedUnits(type: UnitType): PlayerUnit[] {
    return JSON.parse(JSON.stringify(
      (this.units || []).filter(unit => unit.type === type).sort((a, b) => b.level - a.level)
    ));
  }

  private calculateUnitStats(sortedUnits: PlayerUnit[]): number {
    return sortedUnits.reduce((stat, unit) => {
      const unitInfo = UnitTypes.find(u => u.type === unit.type && u.level === unit.level);
      return stat + (unitInfo?.bonus ?? 0) * (unit.quantity ?? 0);
    }, 0);
  }

  private calculateItemStats(sortedItems: PlayerItem[], sortedUnits: PlayerUnit[], unitCoverage: Map<number, number>): number {
    let totalStat = 0;
    // Track used item quantities by type and level
    const itemCountsByTypeLevel: { [itemType: string]: { [level: number]: number } } = {};

    sortedUnits.forEach((unit, unitIndex) => {
      if (unit.quantity <= 0) return;
      if (unit.quantity <= 0) return;
      const unitCurrentCoverage = unitCoverage.get(unitIndex) || 0;
      let unitNeedsCoverage = unit.quantity - unitCurrentCoverage;
      if (unitNeedsCoverage <= 0) return;

      // Get all item types for this usage (e.g., WEAPON, HELM, etc.)
      const itemTypesForUsage = Array.from(new Set(sortedItems.filter(item => item.usage === unit.type).map(item => item.type)));
      // For each item type, assign the best available item (highest level) to as many units as possible (1 per unit per type)
      itemTypesForUsage.forEach(itemType => {
        let unitsLeftForType = unitNeedsCoverage;
        // Get all items of this type and usage, sorted by level descending
        const itemsOfType = sortedItems.filter(item => item.usage === unit.type && item.type === itemType).sort((a, b) => b.level - a.level);
        itemsOfType.forEach(item => {
          if (unitsLeftForType <= 0) return;
          const itemInfo = ItemTypes.find(w => w.level === item.level && w.usage === item.usage && w.type === item.type);
          if (!itemInfo) return;
          if (!itemCountsByTypeLevel[item.type]) itemCountsByTypeLevel[item.type] = {};
          if (!itemCountsByTypeLevel[item.type][item.level]) itemCountsByTypeLevel[item.type][item.level] = 0;
          const availableItemQuantity = item.quantity - itemCountsByTypeLevel[item.type][item.level];
          if (availableItemQuantity <= 0) return;
          // Each unit can only equip one of this item type
          const quantityToApply = Math.min(unitsLeftForType, availableItemQuantity);
          totalStat += (itemInfo.bonus ?? 0) * quantityToApply;
          itemCountsByTypeLevel[item.type][item.level] += quantityToApply;
          unitsLeftForType -= quantityToApply;
        });
      });
      // Update the overall coverage for this unit index (items applied in this step)
      unitCoverage.set(unitIndex, unit.quantity - unitNeedsCoverage);
    });
    return totalStat;
  }

  private calculateBattleUpgradeStats(sortedUnits: PlayerUnit[], type: UnitType, unitCoverage: Map<number, number>): number {
    let totalStat = 0;
    const applicableUpgrades = (this.battle_upgrades || [])
      .filter(up => up.type === type)
      .sort((a, b) => b.level - a.level); // Process higher level upgrades first

    applicableUpgrades.forEach(upgrade => {
      const upgradeInfo = BattleUpgrades.find(bu => bu.type === upgrade.type && bu.level === upgrade.level);
      if (!upgradeInfo || upgrade.quantity <= 0) return;

      let remainingUpgradeQuantity = upgrade.quantity; // How many of this upgrade are available

      sortedUnits.forEach((unit, unitIndex) => {
        if (remainingUpgradeQuantity <= 0) return; // No more of this upgrade left
        if (unit.quantity <= 0 || unit.level < upgradeInfo.minUnitLevel) return; // Unit not eligible

        const unitCurrentCoverage = unitCoverage.get(unitIndex) || 0;
        const unitNeedsCoverage = unit.quantity - unitCurrentCoverage;
        if (unitNeedsCoverage <= 0) return; // Unit already fully covered

        // How many units can this upgrade *potentially* cover?
        const maxUnitsUpgradeable = remainingUpgradeQuantity * upgradeInfo.unitsCovered;

        // How many units actually get the upgrade in this step?
        const unitsToUpgrade = Math.min(unitNeedsCoverage, maxUnitsUpgradeable);

        if (unitsToUpgrade > 0) {
          totalStat += (upgradeInfo.bonus ?? 0) * unitsToUpgrade;

          // Update coverage and remaining upgrade quantity
          unitCoverage.set(unitIndex, unitCurrentCoverage + unitsToUpgrade);
          remainingUpgradeQuantity -= Math.ceil(unitsToUpgrade / upgradeInfo.unitsCovered);
        }
      });
    });

    return totalStat;
  }


  private applyBonuses(type: UnitType, totalStat: number): number {
    let bonusPercent = 0;
    switch (type) {
      case 'OFFENSE': bonusPercent = this.attackBonus; break;
      case 'DEFENSE': bonusPercent = this.defenseBonus; break;
      case 'SPY': bonusPercent = this.spyBonus; break;
      case 'SENTRY': bonusPercent = this.sentryBonus; break;
    }
    return totalStat * (1 + bonusPercent / 100);
  }

  /**
   * Checks if the user can attack another player based on level range.
   * @param level - The level of the target player.
   * @returns True if the target is within the attackable level range, false otherwise.
   */
  canAttack(level: number): boolean {
    const userLevel = this.level;
    const levelRange = parseInt(process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE || '5', 10);
    // Ensure user level is within the allowed range of the target level
    return userLevel >= level - levelRange && userLevel <= level + levelRange;
  }


  /** Gets a summary of unit quantities by type. */
  get unitTotals(): UnitTotalsType {
    const totals: UnitTotalsType = {
      citizens: 0, workers: 0, offense: 0, defense: 0,
      spies: 0, sentries: 0, assassins: 0, infiltrators: 0
    };
    (this.units || []).forEach(unit => {
      switch (unit.type) {
        case 'CITIZEN': totals.citizens += unit.quantity; break;
        case 'WORKER': totals.workers += unit.quantity; break;
        case 'OFFENSE': totals.offense += unit.quantity; break;
        case 'DEFENSE': totals.defense += unit.quantity; break;
        case 'SPY':
          totals.spies += unit.quantity; // Add to total spies regardless of level
          if (unit.level === 2) totals.infiltrators += unit.quantity;
          if (unit.level === 3) totals.assassins += unit.quantity;
          break;
        case 'SENTRY': totals.sentries += unit.quantity; break;
      }
    });
    return totals;
  }

  /** Calculates the user's current level based on their experience. */
  get level(): number {
    return getLevelFromXP(this.experience);
  }

  /**
   * Gets the total experience points required to reach a specific level.
   * @param level - The target level.
   * @returns The required XP, or Infinity if the level is not defined.
   */
  xpRequiredForLevel(level: number): number {
    const levelInfo = levelXPArray.find(l => l.level === level);
    return levelInfo?.xp ?? Infinity; // Return Infinity if level not found
  }


  /** Calculates the experience points needed to reach the next level. */
  get xpToNextLevel(): number {
    const nextLevelXP = this.xpRequiredForLevel(this.level + 1);
    return nextLevelXP === Infinity ? 0 : Math.max(0, nextLevelXP - this.experience);
  }


  /** Gets the current and maximum fortification health, and the health percentage. */
  get fortHealth(): FortHealth {
    const maxHP = Fortifications.find(f => f.level === this.fortLevel)?.hitpoints ?? 0;
    const currentHP = this.fortHitpoints ?? 0;
    return {
      current: currentHP,
      max: maxHP,
      percentage: maxHP > 0 ? Math.floor((currentHP / maxHP) * 100) : 0,
    };
  }


  /**
   * Increments the level of a specific structure upgrade type in the user's data.
   * If the upgrade type doesn't exist, it adds it at level 1.
   * @param type - The type of structure upgrade to increment (e.g., 'OFFENSE', 'ARMORY').
   * @returns The updated array of structure upgrades.
   */
  increaseStatLevel(type: StructureUpgrade['type']): StructureUpgrade[] {
    let found = false;
    const newUpgrades = (this.structure_upgrades || []).map(stat => {
      if (stat.type === type) {
        found = true;
        return { ...stat, level: (stat.level || 0) + 1 }; // Ensure level exists before incrementing
      }
      return stat;
    });
    // If the stat type wasn't found, add it with level 1 (or appropriate starting level)
    if (!found) {
      newUpgrades.push({ type: type, level: 1 });
    }
    this.structure_upgrades = newUpgrades; // Update the instance property
    return newUpgrades;
  }

  /**
   * Calculates the timestamp for the next attack turn regeneration.
   * @param date - The current date/time (defaults to now).
   * @returns A Date object representing the next turn time.
   */
  getTimeToNextTurn(date = new Date()): Date {
    const ms = 1800000; // 30mins in ms
    // Ceil the current time to the next 30-minute interval
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  }


  /** Gets a list of unit types available to the user based on their fort level. */
  get availableUnitTypes(): Unit[] {
    return (UnitTypes || []).filter(unitType => {
      const requiredFortLevel = unitType.fortLevel ?? 1; // Default requirement if not specified
      return requiredFortLevel <= this.fortLevel;
    });
  }

  /** Gets a list of item types available to the user based on their armory level. */
  get availableItemTypes(): Item[] {
    const armoryLvl = this.armoryLevel;
    return (ItemTypes || []).filter(item => (item.armoryLevel ?? 1) <= armoryLvl);
  }


  /** Gets a list of fortifications available for upgrade (current level + next two). */
  get availableFortifications(): Fortification[] {
    return (Fortifications || []).filter((fort) => fort.level <= (this.fortLevel || 0) + 2);
  }


  private getAvailableBattleUpgrades(type: UnitType | string): UnitUpgradeType[] {
    const requiredSiegeLevel = this.offensiveLevel; // Assuming offensiveLevel is the requirement
    return (BattleUpgrades || [])
      .filter(up => up.type === type && (up.SiegeUpgradeLevel ?? 1) <= requiredSiegeLevel);
  }

  /** Gets available DEFENSE battle upgrades based on offensive structure level. */
  get availableDefenseBattleUpgrades(): UnitUpgradeType[] {
    return this.getAvailableBattleUpgrades('DEFENSE');
  }

  /** Gets available OFFENSE battle upgrades based on offensive structure level. */
  get availableOffenseBattleUpgrades(): UnitUpgradeType[] {
    return this.getAvailableBattleUpgrades('OFFENSE');
  }

  /** Gets available SPY battle upgrades based on offensive structure level. */
  get availableSpyBattleUpgrades(): UnitUpgradeType[] {
    return this.getAvailableBattleUpgrades('SPY');
  }

  /** Gets available SENTRY battle upgrades based on offensive structure level. */
  get availableSentryBattleUpgrades(): UnitUpgradeType[] {
    return this.getAvailableBattleUpgrades('SENTRY');
  }



  /** Gets the user's current armory structure level. */
  get armoryLevel(): number {
    return (this.structure_upgrades || []).find(s => s.type === 'ARMORY')?.level ?? 0;
  }

  /** Gets the user's current offensive structure level. */
  get offensiveLevel(): number {
    return (this.structure_upgrades || []).find(s => s.type === 'OFFENSE')?.level ?? 0;
  }

  /** Gets the user's current spy structure level. */
  get spyLevel(): number {
    return (this.structure_upgrades || []).find(s => s.type === 'SPY')?.level ?? 0;
  }

  /** Gets the user's current sentry structure level. */
  get sentryLevel(): number {
    return (this.structure_upgrades || []).find(s => s.type === 'SENTRY')?.level ?? 0;
  }


  /** Gets the maximum number of bank deposits allowed per day based on economy level. */
  get maximumBankDeposits(): number {
    const upgrade = EconomyUpgrades[this.economyLevel];
    return upgrade?.depositsPerDay ?? 0; // Default to 0 if not found
  }


  /** Gets the minimum and maximum levels the user can attack. */
  get attackRange(): { min: number; max: number } {
    const levelRange = parseInt(process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE || '5', 10);
    const currentLevel = this.level;
    return {
      min: Math.max(1, currentLevel - levelRange), // Min level is 1
      max: currentLevel + levelRange,
    };
  }

}

export default UserModel;