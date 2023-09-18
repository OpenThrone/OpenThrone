import md5 from 'md5';

import type {
  BonusPointsItem,
  DefensiveUpgradeType,
  FortHealth,
  Fortification,
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
  Bonuses,
  Fortifications,
  HouseUpgrades,
  OffenseiveUpgrades,
  SentryUpgrades,
  SpyUpgrades,
  UnitTypes,
  WeaponTypes,
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

  public bonus_points: BonusPointsItem[];

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

    this.attackTurns = 0;
    this.last_active = new Date();
    this.units = [];
    this.items = [];
    this.bio = '';
    this.colorScheme = '';
    this.is_player = false;
    this.is_online = false;
    this.overallrank = 0;
    if (userData) {
      this.id = userData.id;
      this.displayName = userData.display_name;
      if (!filtered) {
        this.email = userData.email;
        this.passwordHash = userData.password_hash;
        this.goldInBank = userData.gold_in_bank;
      }

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
      this.attacks_made = userData.attacksMade;
      this.attacks_defended = userData.attacksDefended;
      this.bonus_points = userData.bonus_points;
    }
  }
  /* const [online, setOnline] = useState(false);

  useEffect(() => {
    const lastActiveDate = new Date(last_active);
    const currentTime = new Date();
    const differenceInMinutes = (currentTime - lastActiveDate) / (1000 * 60);
    
    if (differenceInMinutes <= 15) {
      setOnline(true);
    }
  }, []); */

  get population() {
    return this.units.reduce((acc, unit) => acc + unit.quantity, 0);
  }

  get availableProficiencyPoints() {
    return (
      this.level -
      this.bonus_points.reduce((acc, bonus) => acc + bonus.level, 0)
    );
  }

  get playerBonuses() {
    return Bonuses.filter(
      (bonus) => bonus.race === this.race || bonus.race === this.class
    );
  }

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

  get recruitingLink() {
    return md5(this.id.toString());
  }

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

  get armySize(): number {
    return this.units
      .filter((unit) => unit.type !== 'CITIZEN' && unit.type !== 'WORKER')
      .reduce((acc, unit) => acc + unit.quantity, 0);
  }

  get kingdomSize(): number {
    return this.units.reduce((acc, unit) => acc + unit.quantity, 0);
  }

  get citizens(): number {
    return this.units.find((unit) => unit.type === 'CITIZEN').quantity;
  }

  get goldPerTurn(): number {
    const workerUnits = this.units.filter((units) => units.type === 'WORKER');
    const workerGoldPerTurn = workerUnits
      .map(
        (unit) =>
          UnitTypes.find(
            (unitType) =>
              unitType.type === unit.type && unitType.level === unit.level
          ).bonus *
          unit.quantity *
          (1 + parseInt(this.incomeBonus.toString(), 10) / 100)
      )
      .reduce((acc, gold) => acc + gold, 0);

    const fortificationGoldPerTurn =
      Fortifications[this.fortLevel - 1]?.goldPerTurn;
    return workerGoldPerTurn + fortificationGoldPerTurn;
  }

  getArmyStat(type: UnitType) {
    const Units = this.units?.filter((unit) => unit.type === type) || [];

    let totalStat = 0;

    Units.forEach((unit) => {
      // Get the unit's bonus
      const unitBonus =
        UnitTypes.find(
          (unitType) =>
            unitType.type === unit.type && unitType.level === unit.level
        )?.bonus || 0;

      // Add the unit's bonus to the total
      totalStat += unitBonus * unit.quantity;

      // Filter out the weapons that match the unit type and level based on their usage
      const matchingWeapons =
        this.items?.filter(
          (weapon) => weapon.usage === unit.type && weapon.level === unit.level
        ) || [];

      // Calculate the total bonus from weapons, but only up to the number of units
      matchingWeapons.forEach((weapon) => {
        const weaponBonus =
          WeaponTypes.find(
            (w) => w.level === weapon.level && w.usage === unit.type
          )?.bonus || 0;

        // Use the minimum of weapon quantity and unit quantity for the bonus calculation
        totalStat += weaponBonus * Math.min(weapon.quantity, unit.quantity);
      });
    });

    // Apply the appropriate bonus based on the type
    switch (type) {
      case 'OFFENSE':
        totalStat *= 1 + parseInt(this.attackBonus.toString(), 10) / 100;
        break;
      case 'DEFENSE':
        totalStat *= 1 + parseInt(this.defenseBonus.toString(), 10) / 100;
        break;
      case 'SPY':
        totalStat *= 1 + parseInt(this.intelBonus.toString(), 10) / 100;
        break;
      case 'SENTRY':
        totalStat *= 1 + parseInt(this.intelBonus.toString(), 10) / 100;
        break;
      default:
        break;
    }

    // Round up the final result
    return Math.ceil(totalStat);
  }

  get offense(): number {
    return this.getArmyStat('OFFENSE');
  }

  get defense(): number {
    return this.getArmyStat('DEFENSE');
  }

  get sentry(): number {
    return this.getArmyStat('SENTRY');
  }

  get spy(): number {
    return this.getArmyStat('SPY');
  }

  canAttack(level: number): boolean {
    return (
      this.getLevelFromXP(this.experience) >= level - 5 &&
      this.getLevelFromXP(this.experience) <= level + 5
    );
  }

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

  /* getLevelFromXP(xp: number): number {
    const level = Math.floor(-2.5 + Math.sqrt(4.25 + 0.002 * xp));
    console.log(xp);
    if (level < 1) return 1;
    return level;
  } */

  get level(): number {
    if (this.experience === 0) return 1;

    return this.getLevelFromXP(this.experience);
  }

  xpRequiredForLevel(level: number): number {
    return Math.floor(level ** 2.5 * 1000); // Adjust the power and multiplier for desired curve
  }

  getLevelFromXP(xp: number): number {
    let level = 1;
    while (this.xpRequiredForLevel(level + 1) <= xp) {
      level++;
    }
    return level;
  }

  get xpToNextLevel(): number {
    const currentLevel = this.level;
    const nextLevelXP = this.xpRequiredForLevel(currentLevel + 1);
    return nextLevelXP - this.experience;
  }

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

  // https://www.sitepoint.com/build-javascript-countdown-timer-no-dependencies/
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

  getTimeToNextTurn(date = new Date()) {
    const ms = 1800000; // 30mins in ms
    const nextTurn = new Date(Math.ceil(date.getTime() / ms) * ms);
    return nextTurn;
  }

  /**
   * Limited to level one units only for now, until the upgrade system is
   * implemented.
   */
  get availableUnitTypes(): Unit[] {
    return UnitTypes.filter((unitType) => unitType.level <= this.fortLevel + 1);
  }

  get availableItemTypes(): Weapon[] {
    return WeaponTypes.filter(
      (unitType) => unitType.level <= this.fortLevel + 1
    );
  }

  get availableFortifications(): Fortification[] {
    return Fortifications.filter((fort) => fort.level <= this.fortLevel + 2);
  }

  get availableDefenseBattleUpgrades(): DefensiveUpgradeType[] {
    return DefenseiveUpgrades.filter(
      (fort) => fort.fortLevelRequirement <= this.fortLevel + 1
    );
  }

  get availableOffenseBattleUpgrades(): OffensiveUpgradeType[] {
    return OffenseiveUpgrades.filter(
      (fort) => fort.fortLevelRequirement <= this.fortLevel + 1
    );
  }

  get availableSpyBattleUpgrades(): SpyUpgradeType[] {
    return SpyUpgrades.filter(
      (fort) => fort.fortLevelRequirement <= this.fortLevel + 1
    );
  }

  get availableSentryBattleUpgrades(): SentryUpgradeType[] {
    return SentryUpgrades.filter(
      (fort) => fort.fortLevelRequirement <= this.fortLevel + 1
    );
  }

  get maximumBankDeposits(): number {
    return 1;
  }
}

export default UserModel;
