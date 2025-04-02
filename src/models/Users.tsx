import md5 from 'md5';
import { getAssetPath } from '@/utils/utilities';
import { User as PrismaUser } from '@prisma/client'; // Import Prisma User type

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
  PlayerItem, // Use this for the items array type
  PlayerBattleUpgrade, // Use this for battle_upgrades array type
  StructureUpgrade, // Use this for structure_upgrades array type
  PlayerStat, // Use this for stats array type
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
import { stringifyObj } from '@/utils/numberFormatting'; // Keep for constructor usage if needed

class UserModel {
  public id: number;
  public displayName: string;
  public email: string;
  public passwordHash: string;
  public race: PlayerRace;
  public class: PlayerClass;
  public experience: number;
  public gold: bigint; // Use bigint internally
  public goldInBank: bigint; // Use bigint internally
  public fortLevel: number;
  public fortHitpoints: number;
  public houseLevel: number;
  public attackTurns: number;
  public units: PlayerUnit[];
  public items: PlayerItem[]; // Use specific PlayerItem type
  public last_active: Date | null; // Allow null
  public bio: string;
  public colorScheme: PlayerRace | string | null; // Allow null
  public is_player: boolean;
  public is_online: boolean;
  public overallrank: number;
  public attacks_made: number;
  public attacks_defended: number;
  public attacks_won: number;
  public defends_won: number;
  public bonus_points: BonusPointsItem[];
  public economyLevel: number;
  public structure_upgrades: StructureUpgrade[];
  public battle_upgrades: PlayerBattleUpgrade[];
  public stats: PlayerStat[];
  public beenAttacked: boolean; // we shouldn't need this in the model, just in the context for current user notification
  public detectedSpy: boolean; // we shouldn't need this in the model, just in the context for current user notification
  public locale: Locales;
  public avatar: string | null; // Allow null
  public permissions: any[]; // Keep as any for now unless specific structure is known
  public currentStatus: string; // From calculated field in API response
  public offense: number; // Calculated
  public defense: number; // Calculated
  public spy: number; // Calculated
  public sentry: number; // Calculated
  private checkStats: boolean; // Internal flag

  constructor(userData?: PrismaUser | null, filtered: boolean = true, checkStats: boolean = true) {
    // Ensure userData is not null or undefined before processing
    const safeUserData = userData ? JSON.parse(JSON.stringify(stringifyObj(userData))) : null;

    this.id = safeUserData?.id ?? 0;
    this.displayName = safeUserData?.display_name ?? '';
    this.email = ''; // Only set if not filtered
    this.passwordHash = ''; // Only set if not filtered
    this.race = safeUserData?.race ?? 'ELF';
    this.class = safeUserData?.class ?? 'ASSASSIN';
    this.experience = safeUserData?.experience ?? 0;
    this.gold = BigInt(safeUserData?.gold ?? '0'); // Default to BigInt(0)
    this.goldInBank = BigInt('0'); // Default to BigInt(0)
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
      this.is_online = (nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15;
    }

    // Calculate derived stats if requested
    if (checkStats) {
      this.updateStats();
    }
  }


  updateStats() {
    this.offense = this.getArmyStat('OFFENSE');
    this.defense = this.getArmyStat('DEFENSE');
    this.spy = this.getArmyStat('SPY');
    this.sentry = this.getArmyStat('SENTRY');
  }

  get attacksWon(): number {
    return this.statistics('OFFENSE', 'WON'); // Use statistics method
  }

  get defendsWon(): number {
    return this.statistics('DEFENSE', 'WON'); // Use statistics method
  }

  statistics(type: 'OFFENSE' | 'DEFENSE' | 'SPY' | 'SENTRY', subType: 'WON' | 'LOST' | string): number {
    if (!this.stats) return 0;
    return this.stats.find(stat => stat.type === type && stat.subtype === subType)?.stat ?? 0;
  }

  get netWorth(): bigint {
    // Ensure properties are BigInt before adding
    const goldOnHand = BigInt(this.gold || 0);
    const goldInBank = BigInt(this.goldInBank || 0);
    return goldOnHand + goldInBank;
  }

  get availableProficiencyPoints(): number {
    if (!this.bonus_points) return this.level; // Or 0 depending on logic
    return (
      this.level -
      (this.bonus_points || []).reduce((acc, bonus) => acc + bonus.level, 0)
    );
  }

  get usedProficiencyPoints(): number {
    if (!this.bonus_points) return 0;
    return (this.bonus_points || []).reduce((acc, bonus) => acc + bonus.level, 0);
  }


  get playerBonuses(): PlayerBonus[] {
    return Bonuses.filter(
      (bonus) => bonus.race === this.race || bonus.race === this.class
    );
  }

  get incomeBonus(): number {
    const baseBonus = (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'INCOME')
      .reduce((sum, bonus) => sum + bonus.bonusAmount, 0);

    const pointsBonus = (this.bonus_points || [])
      .filter((bonus) => bonus.type === 'INCOME')
      .reduce((sum, bonus) => sum + bonus.level, 0);

    return baseBonus + pointsBonus;
  }


  get recruitingLink(): string {
    return md5(this.id.toString());
  }

  get attackBonus(): number {
    const baseBonus = (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'OFFENSE')
      .reduce((sum, bonus) => sum + bonus.bonusAmount, 0);

    const pointsBonus = (this.bonus_points || [])
      .filter((bonus) => bonus.type === 'OFFENSE')
      .reduce((sum, bonus) => sum + bonus.level, 0);

    const structureBonus = (this.structure_upgrades || [])
      .filter(upgrade => upgrade.type === 'OFFENSE')
      .map(upgrade => OffensiveUpgrades.find(u => u.level === upgrade.level)?.offenseBonusPercentage ?? 0)
      .reduce((sum, bonus) => sum + bonus, 0);

    return baseBonus + pointsBonus + structureBonus;
  }


  get defenseBonus(): number {
    const baseBonus = (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'DEFENSE')
      .reduce((sum, bonus) => sum + bonus.bonusAmount, 0);

    const pointsBonus = (this.bonus_points || [])
      .filter((bonus) => bonus.type === 'DEFENSE')
      .reduce((sum, bonus) => sum + bonus.level, 0);

    const fortBonus = Fortifications.find(f => f.level === this.fortLevel)?.defenseBonusPercentage ?? 0;

    return baseBonus + pointsBonus + fortBonus;
  }


  get intelBonus(): number {
    const baseBonus = (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'INTEL')
      .reduce((sum, bonus) => sum + bonus.bonusAmount, 0);

    const pointsBonus = (this.bonus_points || [])
      .filter((bonus) => bonus.type === 'INTEL')
      .reduce((sum, bonus) => sum + bonus.level, 0);

    return baseBonus + pointsBonus;
  }


  get spyBonus(): number {
    const spyLevel = this.spyLevel; // Get level once
    const structureBonus = SpyUpgrades.find(u => u.level === spyLevel)?.offenseBonusPercentage ?? 0;
    return structureBonus + this.intelBonus;
  }

  get sentryBonus(): number {
    const sentryLevel = this.sentryLevel; // Get level once
    const structureBonus = SentryUpgrades.find(u => u.level === sentryLevel)?.defenseBonusPercentage ?? 0;
    return structureBonus + this.intelBonus;
  }

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

  get spyLimits(): {
    infil: { perUser: number; perMission: number; perDay: number };
    assass: { perUser: number; perMission: number; perDay: number };
    stats: { level: number; all: any } // Adjust 'any' type if SpyUpgradeType is defined
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


  get recruitingBonus(): number {
    const baseBonus = (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'RECRUITING')
      .reduce((sum, bonus) => sum + bonus.bonusAmount, 0);

    const houseBonus = HouseUpgrades[this.houseLevel as keyof typeof HouseUpgrades]?.citizensDaily ?? 0;

    return baseBonus + houseBonus;
  }

  get casualtyBonus(): number {
    return (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'CASUALTY')
      .reduce((sum, bonus) => sum + bonus.bonusAmount, 0);
  }


  get priceBonus(): number {
    const baseBonus = (this.playerBonuses || [])
      .filter((bonus) => bonus.bonusType === 'PRICES')
      .reduce((sum, bonus) => sum + bonus.bonusAmount, 0);

    const pointsBonus = (this.bonus_points || [])
      .filter((bonus) => bonus.type === 'PRICES')
      .reduce((sum, bonus) => sum + bonus.level, 0);

    return baseBonus + pointsBonus;
  }


  get armySize(): number {
    return (this.units || [])
      .filter((unit) => unit.type !== 'CITIZEN' && unit.type !== 'WORKER')
      .reduce((acc, unit) => acc + (unit.quantity || 0), 0);
  }

  get population(): number {
    return (this.units || []).reduce((acc, unit) => acc + (unit.quantity || 0), 0);
  }

  get citizens(): number {
    return this.units?.find((unit) => unit.type === 'CITIZEN')?.quantity ?? 0;
  }

  get goldPerTurn(): bigint {
    const workerUnits = (this.units || []).filter((unit) => unit.type === 'WORKER');
    const economyUpgrade = EconomyUpgrades[this.economyLevel];
    const goldPerWorker = economyUpgrade?.goldPerWorker ?? 0; // Default to 0 if not found
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


  get fortificationGoldPerTurn(): number {
    return Fortifications.find((fort) => fort.level === this.fortLevel)?.goldPerTurn ?? 0;
  }

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


  get goldPerWorkerPerTurn(): number {
    const economyUpgrade = EconomyUpgrades[this.economyLevel];
    const goldPerWorkerBase = economyUpgrade?.goldPerWorker ?? 0;
    const incomeBonusPercent = this.incomeBonus;

    return goldPerWorkerBase * (1 + incomeBonusPercent / 100);
  }


  getLevelForUnit(type: UnitType): number {
    // Return fortLevel if type is relevant, otherwise 1
    if (['OFFENSE', 'DEFENSE', 'SENTRY', 'SPY'].includes(type)) {
      return this.fortLevel;
    } 
    return 1;
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
    const unitCoverage = new Map<number, number>(); // Tracks item/upgrade coverage per unit index

    totalStat += this.calculateUnitStats(sortedUnits);
    totalStat += this.calculateItemStats(sortedItems, sortedUnits, unitCoverage);
    totalStat += this.calculateBattleUpgradeStats(sortedUnits, type, unitCoverage);

    totalStat = this.applyBonuses(type, totalStat);
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
    const itemCountsByTypeLevel: { [itemType: string]: { [level: number]: number } } = {}; // Track used item quantities

    sortedUnits.forEach((unit, unitIndex) => {
      if (unit.quantity <= 0) return; // Skip if unit quantity is zero

      const unitCurrentCoverage = unitCoverage.get(unitIndex) || 0;
      let unitNeedsCoverage = unit.quantity - unitCurrentCoverage; // How many units still need items

      if (unitNeedsCoverage <= 0) return; // Skip if unit is already fully covered by previous calculations (e.g., upgrades)

      const itemsApplicableToUnit = sortedItems.filter(item => item.usage === unit.type);

      itemsApplicableToUnit.forEach(item => {
        if (unitNeedsCoverage <= 0) return; // Stop if this unit is covered

        const itemInfo = ItemTypes.find(w => w.level === item.level && w.usage === item.usage && w.type === item.type);
        if (!itemInfo) return;

        // Initialize tracking for this item type/level if needed
        if (!itemCountsByTypeLevel[item.type]) itemCountsByTypeLevel[item.type] = {};
        if (!itemCountsByTypeLevel[item.type][item.level]) itemCountsByTypeLevel[item.type][item.level] = 0;

        const availableItemQuantity = item.quantity - itemCountsByTypeLevel[item.type][item.level];
        if (availableItemQuantity <= 0) return; // No more of this specific item available

        // Determine how many units can receive this item
        const quantityToApply = Math.min(unitNeedsCoverage, availableItemQuantity);

        totalStat += (itemInfo.bonus ?? 0) * quantityToApply;

        // Update counts
        itemCountsByTypeLevel[item.type][item.level] += quantityToApply;
        unitNeedsCoverage -= quantityToApply;
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

  canAttack(level: number): boolean {
    const userLevel = this.level;
    const levelRange = parseInt(process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE || '5', 10);
    return userLevel >= level - levelRange && userLevel <= level + levelRange;
  }


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
          totals.spies += unit.quantity;
          if (unit.level === 2) totals.infiltrators += unit.quantity;
          if (unit.level === 3) totals.assassins += unit.quantity;
          break;
        case 'SENTRY': totals.sentries += unit.quantity; break;
      }
    });
    return totals;
  }

  get level(): number {
    return getLevelFromXP(this.experience);
  }

  xpRequiredForLevel(level: number): number {
    const levelInfo = levelXPArray.find(l => l.level === level);
    return levelInfo?.xp ?? Infinity; // Return Infinity if level not found
  }


  get xpToNextLevel(): number {
    const nextLevelXP = this.xpRequiredForLevel(this.level + 1);
    return nextLevelXP === Infinity ? 0 : Math.max(0, nextLevelXP - this.experience);
  }


  get fortHealth(): FortHealth {
    const maxHP = Fortifications.find(f => f.level === this.fortLevel)?.hitpoints ?? 0;
    return {
      current: this.fortHitpoints ?? 0,
      max: maxHP,
      percentage: maxHP > 0 ? Math.floor(((this.fortHitpoints ?? 0) / maxHP) * 100) : 0,
    };
  }


  increaseStatLevel(type: string): StructureUpgrade[] {
    let found = false;
    const newUpgrades = (this.structure_upgrades || []).map(stat => {
      if (stat.type === type) {
        found = true;
        return { ...stat, level: stat.level + 1 };
      }
      return stat;
    });
    // If the stat type wasn't found, add it with level 1 (or appropriate starting level)
    if (!found) {
      newUpgrades.push({ type: type as StructureUpgrade['type'], level: 1 });
    }
    this.structure_upgrades = newUpgrades; // Update the instance property
    return newUpgrades;
  }

  getTimeToNextTurn(date = new Date()): Date {
    const ms = 1800000; // 30mins in ms
    return new Date(Math.ceil(date.getTime() / ms) * ms);
  }


  get availableUnitTypes(): Unit[] {
    // Use optional chaining and default empty array
    return (UnitTypes || []).filter(unitType => {
      const requiredFortLevel = unitType.fortLevel ?? 1; // Default requirement if not specified
      return requiredFortLevel <= this.fortLevel;
    });
  }

  get availableItemTypes(): Item[] { // Assuming Item type includes armoryLevel
    const armoryLvl = this.armoryLevel;
    // Use optional chaining and default empty array
    return (ItemTypes || []).filter(item => (item.armoryLevel ?? 1) <= armoryLvl);
  }


  get availableFortifications(): Fortification[] {
    // Use optional chaining and default empty array
    return (Fortifications || []).filter((fort) => fort.level <= (this.fortLevel || 0) + 2);
  }


  private getAvailableBattleUpgrades(type: UnitType | string): UnitUpgradeType[] {
    const requiredSiegeLevel = this.offensiveLevel; // Assuming offensiveLevel determines siege upgrade level
    // Use optional chaining and default empty array
    return (BattleUpgrades || [])
      .filter(up => up.type === type && (up.SiegeUpgradeLevel ?? 1) <= requiredSiegeLevel);
  }

  get availableDefenseBattleUpgrades(): UnitUpgradeType[] {
    return this.getAvailableBattleUpgrades('DEFENSE');
  }

  get availableOffenseBattleUpgrades(): UnitUpgradeType[] {
    return this.getAvailableBattleUpgrades('OFFENSE');
  }

  get availableSpyBattleUpgrades(): UnitUpgradeType[] {
    return this.getAvailableBattleUpgrades('SPY');
  }

  get availableSentryBattleUpgrades(): UnitUpgradeType[] {
    return this.getAvailableBattleUpgrades('SENTRY');
  }



  get armoryLevel(): number {
    return (this.structure_upgrades || []).find(s => s.type === 'ARMORY')?.level ?? 0;
  }

  get offensiveLevel(): number {
    return (this.structure_upgrades || []).find(s => s.type === 'OFFENSE')?.level ?? 0;
  }

  get spyLevel(): number {
    return (this.structure_upgrades || []).find(s => s.type === 'SPY')?.level ?? 0;
  }

  get sentryLevel(): number {
    return (this.structure_upgrades || []).find(s => s.type === 'SENTRY')?.level ?? 0;
  }


  get maximumBankDeposits(): number {
    const upgrade = EconomyUpgrades[this.economyLevel];
    return upgrade?.depositsPerDay ?? 0; // Default to 0 if not found
  }


  get attackRange(): { min: number; max: number } {
    const levelRange = parseInt(process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE || '5', 10);
    const currentLevel = this.level;
    return {
      min: Math.max(1, currentLevel - levelRange),
      max: currentLevel + levelRange,
    };
  }
}

export default UserModel;