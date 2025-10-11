import md5 from 'md5';
import { getAssetPath } from '@/utils/utilities';
import { users as PrismaUser, PermissionType, AccountStatus } from '@prisma/client';

import type {
  BonusPointsItem,
  FortHealth,
  Locales,
  PlayerClass,
  PlayerUnit,
  UnitTotalsType,
  PlayerItem,
  PlayerBattleUpgrade,
  StructureUpgrade,
  PlayerStat,
  PlayerRace,
  UnitType,
} from '@/types/typings';

import { stringifyObj } from '@/utils/numberFormatting';

import { UserStatsService } from '@/services/UserStatsService';
import { UserUnitsService } from '@/services/UserUnitsService';
import { UserEconomyService } from '@/services/UserEconomyService';

/**
 * UserModel is now a lightweight facade that holds raw user data,
 * instantiates domain services (stats, units, economy) and delegates
 * calculated logic to those services. This preserves the original
 * public surface (getters/method names) while moving implementation
 * into testable, single-responsibility service classes.
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
  /** Mercenary units hired by the user. */
  public mercenaries: PlayerUnit[];

  /** Array of items owned by the user. */
  public items: PlayerItem[];
  /** Timestamp of the user's last activity. */
  public last_active: Date | null;
  /** User profile biography or description. */
  public bio: string;
  /** User's selected color scheme (can be race name or custom string). */
  public colorScheme: PlayerRace | string | null;
  /** Whether the account represents a real player (not NPC/system). */
  public is_player: boolean;
  /** Whether the user is currently considered online (based on last_active). */
  public is_online: boolean;
  /** User's overall rank (may be based on different criteria). */
  public overallrank: number;
  /** Total number of attacks the user has performed. */
  public attacks_made: number;
  /** Total number of times the user defended against attacks. */
  public attacks_defended: number;
  /** Total number of attacks won by the user. */
  public attacks_won: number;
  /** Total number of defenses won by the user. */
  public defends_won: number;
  /** Bonus points or temporary buffs applied to the user. */
  public bonus_points: BonusPointsItem[];
  /** User's economy development level. */
  public economyLevel: number;
  /** List of structure upgrades and their levels owned by the user. */
  public structure_upgrades: StructureUpgrade[];
  /** List of battle upgrades purchased by the user. */
  public battle_upgrades: PlayerBattleUpgrade[];
  /** Array of player stats (e.g., proficiency, passive modifiers). */
  public stats: PlayerStat[];
  /** Whether the user has been attacked recently. */
  public beenAttacked: boolean;
  /** Whether a spy was detected on the user's side. */
  public detectedSpy: boolean;
  /** User's preferred locale/language (e.g., 'en-US'). */
  public locale: Locales;
  /** Avatar identifier or asset path; defaults to a shield for new users. */
  public avatar: string | null;
  /** User permissions and roles. */
  public permissions: { type: PermissionType }[];
  /** Current account status (e.g., 'ACTIVE', 'SUSPENDED') or AccountStatus enum. */
  public currentStatus: AccountStatus | string;
  /** Calculated offensive power. */
  public offense: number;
  /** Calculated defensive power. */
  public defense: number;
  /** Calculated total spy strength. */
  public spy: number;
  /** Calculated total sentry strength. */
  public sentry: number;
  public achievements: Record<string, any> = {};
  public twoFactorSecret: string | null = null;

  // Domain services (single responsibility)
  private statsService: UserStatsService;
  /**
   * Service handling user's units and related calculations.
   *
   * @private
   * @type {UserUnitsService}
   * @memberof UserModel
   */
  private unitsService: UserUnitsService;
  /** User's economy-related data and methods. */
  private economyService: UserEconomyService;

  /**
   * Construct a UserModel from raw Prisma user object (or null).
   * The constructor preserves the original safe parsing behaviour that
   * converts BigInt-like values and JSON-string fields into usable JS types.
   * @param userData - Raw user data, typically from Prisma or an API response.
   * @param filtered - If true, sensitive fields like email, passwordHash, and goldInBank are omitted. Defaults to true.
   * @param checkStats - If true, calculates derived stats (offense, defense, etc.) upon initialization. Defaults to true.
   */
  constructor(userData?: PrismaUser | null, filtered: boolean = true, checkStats: boolean = true) {
    const safeUserData = userData ? JSON.parse(JSON.stringify(stringifyObj(userData))) : null;
    
    // Handle null/undefined userData safely
    if (!safeUserData) {
      this.id = 0;
      this.displayName = '';
      this.email = '';
      this.passwordHash = '';
      this.race = 'ELF';
      this.class = 'ASSASSIN';
      this.experience = 0;
      this.gold = BigInt(0);
      this.goldInBank = BigInt(0);
      this.fortLevel = 0;
      this.fortHitpoints = 0;
      this.houseLevel = 0;
      this.attackTurns = 0;
      this.last_active = null;
      this.units = [];
      this.mercenaries = [];
      this.items = [];
      this.bio = '';
      this.colorScheme = null;
      this.is_player = false;
      this.is_online = false;
      this.overallrank = 0;
      this.economyLevel = 0;
      this.bonus_points = [];
      this.structure_upgrades = [];
      this.battle_upgrades = [];
      this.stats = [];
      this.locale = 'en-US';
      this.avatar = null;
      this.permissions = [];
      this.attacks_made = 0;
      this.attacks_defended = 0;
      this.attacks_won = 0;
      this.defends_won = 0;
      this.beenAttacked = false;
      this.detectedSpy = false;
      this.currentStatus = 'ACTIVE';
      this.offense = 0;
      this.defense = 0;
      this.spy = 0;
      this.sentry = 0;
      this.achievements = {};
      this.twoFactorSecret = null;
      return;
    }

    this.id = safeUserData.id ?? 0;
    this.displayName = safeUserData.display_name ?? '';
    this.email = '';
    this.passwordHash = '';
    this.race = safeUserData.race ?? 'ELF';
    this.class = safeUserData.class ?? 'ASSASSIN';
    this.experience = safeUserData.experience ?? 0;
    // Normalize gold which may come as string (possibly ending with 'n'), number, or bigint
    const _rawGold = safeUserData.gold ?? '0';
    if (typeof _rawGold === 'bigint') {
      this.gold = _rawGold;
    } else if (typeof _rawGold === 'number') {
      this.gold = BigInt(_rawGold);
    } else if (typeof _rawGold === 'string') {
      // strip a trailing 'n' if present (some stringify helpers include it)
      const cleaned = _rawGold.endsWith('n') ? _rawGold.slice(0, -1) : _rawGold;
      this.gold = cleaned === '' ? BigInt(0) : BigInt(cleaned);
    } else {
      this.gold = BigInt(String(_rawGold || '0'));
    }
    this.goldInBank = BigInt(0);
    this.fortLevel = safeUserData.fort_level ?? 0;
    this.fortHitpoints = safeUserData.fort_hitpoints ?? 0;
    this.houseLevel = safeUserData.house_level ?? 0;
    this.attackTurns = safeUserData.attack_turns ?? 0;
    this.last_active = safeUserData.last_active ? new Date(safeUserData.last_active) : null;
    this.units = safeUserData.units ?? [];
    this.mercenaries = safeUserData.mercenaries ? (typeof safeUserData.mercenaries === 'string' ? JSON.parse(safeUserData.mercenaries) : safeUserData.mercenaries) : [];
    this.items = safeUserData.items ?? [];
    this.bio = safeUserData.bio ?? '';
    this.colorScheme = safeUserData.colorScheme ?? null;
    this.is_player = false;
    this.is_online = false;
    this.overallrank = safeUserData.rank ?? 0;
    this.economyLevel = safeUserData.economy_level ?? 0;
    this.bonus_points = safeUserData.bonus_points ?? [];
    this.structure_upgrades = safeUserData.structure_upgrades ?? [];
    this.battle_upgrades = safeUserData.battle_upgrades ?? [];
    this.stats = safeUserData.stats ?? [];
    this.locale = safeUserData.locale ?? 'en-US';
    this.avatar = safeUserData.avatar ?? null;
    this.permissions = safeUserData.permissions ?? [];
    this.attacks_made = safeUserData.totalAttacks ?? 0;
    this.attacks_defended = safeUserData.totalDefends ?? 0;
    this.attacks_won = safeUserData.won_attacks ?? 0;
    this.defends_won = safeUserData.won_defends ?? 0;
    this.beenAttacked = safeUserData.beenAttacked ?? false;
    this.detectedSpy = safeUserData.detectedSpy ?? false;
    this.currentStatus = safeUserData.currentStatus ?? 'ACTIVE';
    this.offense = safeUserData.offense ?? 0;
    this.defense = safeUserData.defense ?? 0;
    this.spy = safeUserData.spy ?? 0;
    this.sentry = safeUserData.sentry ?? 0;
  
    this.achievements = safeUserData.achievements ? (typeof safeUserData.achievements === 'string' ? JSON.parse(safeUserData.achievements) : safeUserData.achievements) : {};
    this.twoFactorSecret = safeUserData.twoFactorSecret || null;

    if (!filtered && safeUserData) {
      this.email = safeUserData.email;
      this.passwordHash = safeUserData.password_hash ?? '';
      // Normalize gold_in_bank similar to gold
      const _rawBank = safeUserData.gold_in_bank ?? '0';
      if (typeof _rawBank === 'bigint') {
        this.goldInBank = _rawBank;
      } else if (typeof _rawBank === 'number') {
        this.goldInBank = BigInt(_rawBank);
      } else if (typeof _rawBank === 'string') {
        const cleanedBank = _rawBank.endsWith('n') ? _rawBank.slice(0, -1) : _rawBank;
        this.goldInBank = cleanedBank === '' ? BigInt(0) : BigInt(cleanedBank);
      } else {
        this.goldInBank = BigInt(String(_rawBank || '0'));
      }
    }

    if (this.avatar && this.avatar !== 'SHIELD') {
      // keep provided
    } else {
      this.avatar = getAssetPath('shields', '150x150', this.race);
    }

    if (this.last_active) {
      const nowTimestamp = new Date().getTime();
      const lastActiveTimestamp = this.last_active.getTime();
      this.is_online = (nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15;
    }

    // Instantiate services (order: stats -> units -> economy because economy uses income bonus)
    this.statsService = new UserStatsService({
      experience: this.experience,
      units: this.units,
      items: this.items,
      bonus_points: this.bonus_points,
      structure_upgrades: this.structure_upgrades,
      battle_upgrades: this.battle_upgrades,
      stats: this.stats,
      fortLevel: this.fortLevel,
      fortHitpoints: this.fortHitpoints,
      race: this.race,
      class: this.class,
    });

    this.unitsService = new UserUnitsService({
      units: this.units,
      mercenaries: this.mercenaries,
      items: this.items,
      fortLevel: this.fortLevel,
      structure_upgrades: this.structure_upgrades,
    });

    const incomeBonus = this.statsService.getIncomeBonus();
    this.economyService = new UserEconomyService({
      gold: this.gold,
      goldInBank: this.goldInBank,
      units: this.units,
      economyLevel: this.economyLevel,
      houseLevel: this.houseLevel,
      incomeBonus,
      fortLevel: this.fortLevel,
    });

    if (checkStats) {
      this.updateStats();
    }
  }

  /* ---------------------------
     Delegated getters and methods
     --------------------------- */

  // Level and XP helpers
  get level(): number {
    return this.statsService.calculateLevel();
  }

  xpRequiredForLevel(level: number): number {
    return this.statsService.xpRequiredForLevel(level);
  }

  get xpToNextLevel(): number {
    return this.statsService.xpToNextLevel();
  }

  // Stats & combat
  updateStats() {
    const s = this.statsService.updateStats();
    this.offense = s.offense;
    this.defense = s.defense;
    this.spy = s.spy;
    this.sentry = s.sentry;
  }

  getArmyStat(type: UnitType): number {
    return this.statsService.calculateArmyStat(type);
  }

  // Return type intentionally 'any' to avoid exporting internal service types from this facade
  getArmyStatBreakdown(type: UnitType): any {
    return this.statsService.getArmyStatBreakdown(type);
  }

  // Bonuses / points
  get playerBonuses() {
    return this.statsService.getPlayerBonuses();
  }

  get incomeBonus(): number {
    return this.statsService.getIncomeBonus();
  }

  get attackBonus(): number {
    return this.statsService.getAttackBonus();
  }

  get defenseBonus(): number {
    return this.statsService.getDefenseBonus();
  }

  get intelBonus(): number {
    return this.statsService.getIntelBonus();
  }

  // Price bonus convenience getter (delegates to stats service)
  get priceBonus(): number {
    return this.statsService.getPriceBonus();
  }

  get spyBonus(): number {
    return this.statsService.getSpyBonus();
  }

  get sentryBonus(): number {
    return this.statsService.getSentryBonus();
  }

  get availableProficiencyPoints(): number {
    return this.statsService.getAvailableProficiencyPoints();
  }

  get usedProficiencyPoints(): number {
    return this.statsService.getUsedProficiencyPoints();
  }

  statistics(type: PlayerStat['type'], subType: string): number {
    return this.statsService.statistics(type, subType);
  }

  // Army / units (delegated to units service)
  get unitTotals(): UnitTotalsType {
    return this.unitsService.getUnitTotals();
  }

  get armySize(): number {
    return this.unitsService.getArmySize();
  }

  get population(): number {
    return this.unitsService.getPopulation();
  }

  get citizens(): number {
    return this.unitsService.getCitizens();
  }

  get availableUnitTypes() {
    return this.unitsService.getAvailableUnitTypes();
  }

  get availableItemTypes() {
    return this.unitsService.getAvailableItemTypes();
  }

  getSortedUnits(type: UnitType) {
    return this.unitsService.getSortedUnits(type);
  }
 
  getLevelForUnit(type: UnitType): number {
    return this.unitsService.getLevelForUnit(type);
  }

  /** Spy-related helpers delegated to units service to preserve legacy API */
  get spyMissions(): Record<string, { enabled: boolean; requiredLevel: number }> {
    return this.unitsService.getSpyMissions();
  }

  get spyLimits(): {
    infil: { perUser: number; perMission: number; perDay: number };
    assass: { perUser: number; perMission: number; perDay: number };
    stats: { level: number; all: typeof import('@/constants').SpyUpgrades[number] | undefined }
  } {
    return this.unitsService.getSpyLimits();
  }

  // Economy (delegated to economy service)
  get netWorth(): bigint {
    return this.economyService.getNetWorth();
  }

  get goldPerTurn(): bigint {
    return this.economyService.getGoldPerTurn();
  }

  get fortificationGoldPerTurn(): number {
    return this.economyService.getFortificationGoldPerTurn();
  }

  get workerGoldPerTurn(): number {
    return this.economyService.getWorkerGoldPerTurn();
  }

  get goldPerWorkerPerTurn(): number {
    return this.economyService.getGoldPerWorkerPerTurn();
  }

  get maximumBankDeposits(): number {
    return this.economyService.getMaximumBankDeposits();
  }

  // Recruit / session helpers
  get recruitingLink(): string {
    return md5(this.id.toString());
  }

  // Structure-level helpers (small, read-only helpers left on model)
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

  get fortHealth(): FortHealth {
    return this.statsService.getFortHealth();
  }

  // Simple boolean check encapsulated for compatibility
  canAttack(level: number): boolean {
    if (process.env.NEXT_PUBLIC_ENABLE_ATTACKING === "false") return false;
    const userLevel = this.level;
    const levelRange = parseInt(process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE || '5', 10);
    return userLevel >= level - levelRange && userLevel <= level + levelRange;
  }

  get attackRange(): { min: number; max: number } {
    const levelRange = parseInt(process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE || '5', 10);
    const currentLevel = this.level;
    return {
      min: Math.max(1, currentLevel - levelRange),
      max: currentLevel + levelRange,
    };
  }

  // Preserve existing mutating helper for structure upgrades (kept on model for API compatibility)
  increaseStatLevel(type: StructureUpgrade['type']): StructureUpgrade[] {
    let found = false;
    const newUpgrades = (this.structure_upgrades || []).map(stat => {
      if (stat.type === type) {
        found = true;
        return { ...stat, level: (stat.level || 0) + 1 };
      }
      return stat;
    });
    if (!found) {
      newUpgrades.push({ type: type, level: 1 });
    }
    this.structure_upgrades = newUpgrades;
    // Rebuild services that depend on structure upgrades
    this.statsService = new UserStatsService({
      experience: this.experience,
      units: this.units,
      items: this.items,
      bonus_points: this.bonus_points,
      structure_upgrades: this.structure_upgrades,
      battle_upgrades: this.battle_upgrades,
      stats: this.stats,
      fortLevel: this.fortLevel,
      fortHitpoints: this.fortHitpoints,
      race: this.race,
      class: this.class,
    });
    this.unitsService = new UserUnitsService({
      units: this.units,
      mercenaries: this.mercenaries,
      items: this.items,
      fortLevel: this.fortLevel,
      structure_upgrades: this.structure_upgrades,
    });
    const income = this.statsService.getIncomeBonus();
    this.economyService = new UserEconomyService({
      gold: this.gold,
      goldInBank: this.goldInBank,
      units: this.units,
      economyLevel: this.economyLevel,
      houseLevel: this.houseLevel,
      incomeBonus: income,
      fortLevel: this.fortLevel,
    });
    return newUpgrades;
  }

  getAchievements() {
    const tracked = {
      maxLevelReached: Math.max(this.level, (this.achievements || {}).maxLevelReached || 0),
      totalAttacksWon: this.attacks_won,
      totalDefendsWon: this.defends_won,
      // Add more tracked achievements as needed, e.g., totalGoldEarned if tracked elsewhere
    };
    return { ...(this.achievements || {}), ...tracked };
  }
}


export default UserModel;