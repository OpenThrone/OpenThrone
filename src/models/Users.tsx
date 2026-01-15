import type {
  AccountStatus,
  PermissionType,
  UserBattleUpgrade,
  UserItem,
  users as PrismaUser,
  UserStructureUpgrade,
  UserUnit,
} from '@prisma/client';
import md5 from 'md5';

import { UserEconomyService } from '@/services/UserEconomyService';
import { UserStatsService } from '@/services/UserStatsService';
import { UserUnitsService } from '@/services/UserUnitsService';
import type {
  BattleUnits,
  BonusPointsItem,
  FortHealth,
  Locales,
  PlayerClass,
  PlayerRace,
  PlayerStat,
  PlayerUnit, // Import BattleUnits
  UnitTotalsType,
  UnitType,
} from '@/types/typings';
import type { DetailedCalculatedStrength } from '@/utils/attackFunctions';
import { getAssetPath } from '@/utils/utilities';

/**
 * Safely converts a value to BigInt, handling various input types
 * @param value - The value to convert (BigInt, string, number, or null/undefined)
 * @returns BigInt representation of the value, or BigInt(0) if conversion fails
 */
const safeBigInt = (value: any): bigint => {
  if (value === null || value === undefined) {
    return BigInt(0);
  }

  // If it's already a BigInt, return as-is
  if (typeof value === 'bigint') {
    return value;
  }

  // Convert to string first to handle numbers and existing strings
  const stringValue = String(value);

  // Remove any 'n' suffix if present (from JSON.stringify of BigInt)
  const cleanValue = stringValue.replace(/n$/, '');

  try {
    return BigInt(cleanValue);
  } catch (error) {
    console.warn(`Failed to convert "${value}" to BigInt, using 0`, error);
    return BigInt(0);
  }
};

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
  /** User's current stamina. */
  public stamina: number;
  /** User's maximum stamina. */
  public maxStamina: number;
  /** Array of units owned by the user. */
  public units: BattleUnits[]; // Changed to BattleUnits[]
  /** Mercenary units hired by the user. */
  public mercenaries: BattleUnits[]; // Changed to BattleUnits[]

  /** Array of items owned by the user. */
  public items: UserItem[];
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
  /** Remaining deposits available in the last 24 hours. */
  public depositsAvailable: number;
  /** Countdown until the next deposit is available, or 0 when not applicable. */
  public nextDepositAvailable:
    | { hours: number; minutes: number; seconds: number }
    | 0;
  /** List of structure upgrades and their levels owned by the user. */
  public structure_upgrades: UserStructureUpgrade[];
  /** List of battle upgrades purchased by the user. */
  public battle_upgrades: UserBattleUpgrade[];
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
  public currentEra?: {
    id: number;
    name: string;
    startDate?: string | Date | null;
    endDate?: string | Date | null;
  };

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
  constructor(
    userData?: PrismaUser | null,
    // Keep types permissive to support legacy call-sites which passed booleans
    // as the second/third arguments (e.g. new UserModel(row, true, false)).
    units?: any,
    items?: any,
    structure_upgrades?: any,
    battle_upgrades?: any,
    bonus_points?: any,
    permissions?: any,
    stats?: any,
    filtered: boolean = true,
    checkStats: boolean = true,
  ) {
    const safeUserData = userData ?? null;

    // Backward compatibility: older call sites passed `filtered` as the second
    // argument (e.g. new UserModel(userRow, true, false)). Detect that case
    // and treat the boolean as the `filtered` flag while leaving the other
    // relation params undefined.
    if (typeof units === 'boolean') {
      const filteredFlag = units as unknown as boolean;
      const checkStatsFlag =
        typeof items === 'boolean' ? (items as unknown as boolean) : checkStats;
      units = undefined as any;
      items = undefined as any;
      structure_upgrades = undefined as any;
      battle_upgrades = undefined as any;
      bonus_points = undefined as any;
      permissions = undefined as any;
      stats = undefined as any;
      filtered = filteredFlag;
      checkStats = checkStatsFlag;
    }

    if (!safeUserData) {
      // Initialize with default values if no user data is provided
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
      this.stamina = 100;
      this.maxStamina = 100;
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
      this.depositsAvailable = 0;
      this.nextDepositAvailable = 0;
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
    this.race = (safeUserData.race as PlayerRace) ?? 'ELF';
    this.class = (safeUserData.class as PlayerClass) ?? 'ASSASSIN';
    this.experience = safeUserData.experience ?? 0;
    this.gold = safeBigInt(safeUserData.gold);
    this.goldInBank = safeBigInt(safeUserData.gold_in_bank);
    this.fortLevel = safeUserData.fort_level ?? 0;
    this.fortHitpoints = safeUserData.fort_hitpoints ?? 0;
    this.houseLevel = safeUserData.house_level ?? 1;
    this.attackTurns = safeUserData.attack_turns ?? 0;
    this.stamina = (safeUserData as any).stamina ?? 100;
    this.maxStamina = (safeUserData as any).maxStamina ?? 100;
    this.last_active = safeUserData.last_active
      ? new Date(safeUserData.last_active)
      : null;
    const rawUnits = Array.isArray(units)
      ? units
      : Array.isArray((safeUserData as any).UserUnit)
        ? (safeUserData as any).UserUnit
        : Array.isArray((safeUserData as any).units)
          ? (safeUserData as any).units
          : [];

    // Separate regular units and mercenaries
    this.units = rawUnits
      .filter((u) => !u.isMercenary)
      .map((u) => ({
        ...u,
        level: u.level || 1,
        isMercenary: false,
      })) as BattleUnits[];

    this.mercenaries = rawUnits
      .filter((u) => u.isMercenary)
      .map((u) => ({
        ...u,
        level: u.level || 1,
        isMercenary: true,
      })) as BattleUnits[];

    const rawItems = Array.isArray(items)
      ? items
      : Array.isArray((safeUserData as any).UserItem)
        ? (safeUserData as any).UserItem
        : Array.isArray((safeUserData as any).items)
          ? (safeUserData as any).items
          : [];
    this.items = rawItems;
    this.bio = safeUserData.bio ?? '';
    this.colorScheme = safeUserData.colorScheme ?? null;
    this.is_player = false;
    this.is_online = false;
    this.overallrank = safeUserData.rank ?? 0;
    this.economyLevel = safeUserData.economy_level ?? 0;
    this.depositsAvailable = (safeUserData as any).depositsAvailable ?? 0;
    this.nextDepositAvailable = (safeUserData as any).nextDepositAvailable ?? 0;
    const rawStructureUpgrades = Array.isArray(structure_upgrades)
      ? structure_upgrades
      : Array.isArray((safeUserData as any).UserStructureUpgrade)
        ? (safeUserData as any).UserStructureUpgrade
        : Array.isArray((safeUserData as any).structure_upgrades)
          ? (safeUserData as any).structure_upgrades
          : [];

    const rawBattleUpgrades = Array.isArray(battle_upgrades)
      ? battle_upgrades
      : Array.isArray((safeUserData as any).UserBattleUpgrade)
        ? (safeUserData as any).UserBattleUpgrade
        : Array.isArray((safeUserData as any).battle_upgrades)
          ? (safeUserData as any).battle_upgrades
          : [];

    const rawBonusPoints = Array.isArray(bonus_points)
      ? bonus_points
      : Array.isArray((safeUserData as any).UserBonusPoints)
        ? (safeUserData as any).UserBonusPoints
        : Array.isArray((safeUserData as any).bonus_points)
          ? (safeUserData as any).bonus_points
          : [];

    const rawStats = Array.isArray(stats)
      ? stats
      : Array.isArray((safeUserData as any).stats)
        ? (safeUserData as any).stats
        : [];

    this.bonus_points = rawBonusPoints;
    this.structure_upgrades = rawStructureUpgrades as UserStructureUpgrade[];
    this.battle_upgrades = rawBattleUpgrades as UserBattleUpgrade[];
    this.stats = rawStats as PlayerStat[];
    this.locale = (safeUserData.locale as Locales) ?? 'en-US';
    this.avatar = safeUserData.avatar ?? null;
    const rawPermissions = Array.isArray(permissions)
      ? permissions
      : Array.isArray((safeUserData as any).permissions)
        ? (safeUserData as any).permissions
        : [];
    this.permissions = rawPermissions as { type: PermissionType }[];
    this.attacks_made = this.normalizeCount(
      (safeUserData as any).totalAttacks ?? (safeUserData as any).attacks_made,
    );
    this.attacks_defended = this.normalizeCount(
      (safeUserData as any).totalDefends ??
        (safeUserData as any).attacks_defended,
    );
    this.attacks_won = this.normalizeCount(
      (safeUserData as any).won_attacks ?? (safeUserData as any).attacks_won,
    );
    this.defends_won = this.normalizeCount(
      (safeUserData as any).won_defends ?? (safeUserData as any).defends_won,
    );
    this.beenAttacked = !!(safeUserData as any).beenAttacked;
    this.detectedSpy = !!(safeUserData as any).detectedSpy;
    this.currentStatus = (safeUserData as any).currentStatus || 'ACTIVE';
    this.offense = 0;
    this.defense = 0;
    this.spy = 0;
    this.sentry = 0;
    this.achievements =
      typeof safeUserData.achievements === 'string'
        ? JSON.parse(safeUserData.achievements)
        : (safeUserData.achievements ?? {});
    this.twoFactorSecret = safeUserData.twoFactorSecret || null;
    if ((safeUserData as any).currentEra) {
      this.currentEra = (safeUserData as any).currentEra;
    }

    if (!filtered) {
      this.email = safeUserData.email;
      this.passwordHash = safeUserData.password_hash ?? '';
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
      units: rawUnits, // Pass original units array
      items: this.items,
      bonus_points: this.bonus_points as any,
      structure_upgrades: this.structure_upgrades,
      battle_upgrades: this.battle_upgrades,
      fortLevel: this.fortLevel,
      fortHitpoints: this.fortHitpoints,
      race: this.race,
      class: this.class,
    });

    this.unitsService = new UserUnitsService({
      units: rawUnits.filter((u) => !u.isMercenary), // Pass filtered raw units
      mercenaries: rawUnits.filter((u) => u.isMercenary), // Pass filtered raw mercenaries
      items: this.items,
      fortLevel: this.fortLevel,
      structure_upgrades: this.structure_upgrades,
    });

    const incomeBonus = this.statsService.getIncomeBonus();
    this.economyService = new UserEconomyService({
      gold: this.gold,
      goldInBank: this.goldInBank,
      units: convertToPlayerUnit(rawUnits),
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
    this.offense = s.offense.totalStats.MeleeAtkPower; // Using MeleeAtkPower as primary for offense
    this.defense = s.defense.totalStats.MeleeDefPower; // Using MeleeDefPower as primary for defense
    this.spy = s.spy.totalStats.MeleeAtkPower; // Using MeleeAtkPower as primary for spy
    this.sentry = s.sentry.totalStats.MeleeDefPower; // Using MeleeDefPower as primary for sentry
  }

  getArmyStat(type: UnitType): number {
    const stats = this.statsService.calculateArmyStat(type);
    if (type === 'OFFENSE') {
      return stats.totalStats.MeleeAtkPower + stats.totalStats.RangedAtkPower;
    }
    if (type === 'DEFENSE') {
      return stats.totalStats.MeleeDefPower + stats.totalStats.RangedDefPower;
    }
    return 0;
  }

  // Get detailed stats with totalStats property for use in services
  getDetailedArmyStat(type: UnitType): DetailedCalculatedStrength {
    return this.statsService.calculateArmyStat(type);
  }

  // Return type intentionally 'any' to avoid exporting internal service types from this facade
  getArmyStatBreakdown(type: UnitType): any {
    return {}; // This method is deprecated
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

  get recruitBonus(): number {
    return this.economyService.getRecruitingBonus();
  }

  get availableProficiencyPoints(): number {
    return this.statsService.getAvailableProficiencyPoints();
  }

  get usedProficiencyPoints(): number {
    return this.statsService.getUsedProficiencyPoints();
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
  get spyMissions(): Record<
    string,
    { enabled: boolean; requiredLevel: number }
  > {
    return this.unitsService.getSpyMissions();
  }

  get spyLimits(): {
    infil: { perUser: number; perMission: number; perDay: number };
    assass: { perUser: number; perMission: number; perDay: number };
    stats: {
      level: number;
      all: (typeof import('@/constants').SpyUpgrades)[number] | undefined;
    };
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
    return (
      (this.structure_upgrades || []).find((s) => s.type === 'ARMORY')?.level ??
      1
    );
  }

  get offensiveLevel(): number {
    return (
      (this.structure_upgrades || []).find((s) => s.type === 'OFFENSE')
        ?.level ?? 1
    );
  }

  get spyLevel(): number {
    return (
      (this.structure_upgrades || []).find((s) => s.type === 'SPY')?.level ?? 1
    );
  }

  get sentryLevel(): number {
    return (
      (this.structure_upgrades || []).find((s) => s.type === 'SENTRY')?.level ??
      1
    );
  }

  get fortHealth(): FortHealth {
    return this.statsService.getFortHealth();
  }

  // Simple boolean check encapsulated for compatibility
  canAttack(level: number): boolean {
    if (process.env.NEXT_PUBLIC_ENABLE_ATTACKING === 'false') return false;
    const userLevel = this.level;
    const levelRange = parseInt(
      process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE || '5',
      10,
    );
    return userLevel >= level - levelRange && userLevel <= level + levelRange;
  }

  get attackRange(): { min: number; max: number } {
    const levelRange = parseInt(
      process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE || '5',
      10,
    );
    const currentLevel = this.level;
    return {
      min: Math.max(1, currentLevel - levelRange),
      max: currentLevel + levelRange,
    };
  }

  statistics(
    type: UnitType | 'SPY' | 'SENTRY',
    outcome: 'WON' | 'LOST',
  ): number {
    const category = String(type).toUpperCase();
    const result = String(outcome).toUpperCase();

    const offenseWon = this.normalizeCount(this.attacks_won);
    const offenseTotal = this.normalizeCount(this.attacks_made);
    const defenseWon = this.normalizeCount(this.defends_won);
    const defenseTotal = this.normalizeCount(this.attacks_defended);

    if (category === 'OFFENSE') {
      return result === 'WON'
        ? offenseWon
        : Math.max(0, offenseTotal - offenseWon);
    }

    if (category === 'DEFENSE') {
      return result === 'WON'
        ? defenseWon
        : Math.max(0, defenseTotal - defenseWon);
    }

    const spyLikeKey = category === 'SPY' ? 'spy' : 'sentry';
    const wins = this.normalizeCount(
      (this as any)[`${spyLikeKey}_won`] ??
        (this as any)[`${spyLikeKey}Victories`],
    );
    const total =
      this.normalizeCount((this as any)[`${spyLikeKey}_total`]) ||
      this.normalizeCount((this as any)[`${spyLikeKey}_missions`]) ||
      wins +
        this.normalizeCount(
          (this as any)[`${spyLikeKey}_lost`] ??
            (this as any)[`${spyLikeKey}Lost`],
        );

    return result === 'WON' ? wins : Math.max(0, total - wins);
  }

  private normalizeCount(value: any): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return 0;
  }

  // Preserve existing mutating helper for structure upgrades (kept on model for API compatibility)
  increaseStatLevel(
    type: UserStructureUpgrade['type'],
  ): UserStructureUpgrade[] {
    let found = false;
    const newUpgrades = (this.structure_upgrades || []).map((stat) => {
      if (stat.type === type) {
        found = true;
        return { ...stat, level: (stat.level || 0) + 1 };
      }
      return stat;
    });
    if (!found) {
      newUpgrades.push({ id: 0, userId: this.id, type, level: 1 });
    }
    this.structure_upgrades = newUpgrades;

    // Get raw units for service reconstruction
    const allUnits = [...this.units, ...this.mercenaries];
    const rawUnits = allUnits.map((bu) => ({
      id: bu.id || 0,
      userId: bu.userId || this.id,
      type: bu.type as any,
      level: bu.level || 1,
      quantity: bu.quantity || 0,
      isMercenary: bu.isMercenary || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as UserUnit[];

    // Rebuild services
    this.statsService = new UserStatsService({
      experience: this.experience,
      units: rawUnits,
      items: this.items,
      bonus_points: this.bonus_points as any,
      structure_upgrades: this.structure_upgrades,
      battle_upgrades: this.battle_upgrades,
      fortLevel: this.fortLevel,
      fortHitpoints: this.fortHitpoints,
      race: this.race,
      class: this.class,
    });

    this.unitsService = new UserUnitsService({
      units: rawUnits.filter((u) => !u.isMercenary),
      mercenaries: rawUnits.filter((u) => u.isMercenary),
      items: this.items,
      fortLevel: this.fortLevel,
      structure_upgrades: this.structure_upgrades,
    });

    const income = this.statsService.getIncomeBonus();
    this.economyService = new UserEconomyService({
      gold: this.gold,
      goldInBank: this.goldInBank,
      units: convertToPlayerUnit(rawUnits),
      economyLevel: this.economyLevel,
      houseLevel: this.houseLevel,
      incomeBonus: income,
      fortLevel: this.fortLevel,
    });

    return newUpgrades;
  }

  getAchievements() {
    const tracked = {
      maxLevelReached: Math.max(
        this.level,
        (this.achievements || {}).maxLevelReached || 0,
      ),
      totalAttacksWon: this.attacks_won,
      totalDefendsWon: this.defends_won,
      // Add more tracked achievements as needed, e.g., totalGoldEarned if tracked elsewhere
    };
    return { ...(this.achievements || {}), ...tracked };
  }
}

// Convert BattleUnits to PlayerUnit format for economy service
const convertToPlayerUnit = (units: UserUnit[]): PlayerUnit[] => {
  return Array.isArray(units)
    ? units.map((unit) => ({
        id: (unit as any).id ?? 0,
        userId: (unit as any).userId ?? 0,
        type: unit.type as UnitType,
        level: unit.level || 1,
        quantity: unit.quantity || 0,
        isMercenary: !!(unit as any).isMercenary,
      }))
    : [];
};

export default UserModel;
