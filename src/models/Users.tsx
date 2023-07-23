import md5 from 'md5';

import type {
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
  Levels,
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

  constructor(userData: any, filtered: boolean = true) {
    this.id = 0;
    this.displayName = '';
    this.email = '';
    this.passwordHash = '';
    this.race = 'ALL';
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
        this.attackTurns = userData.attack_turns;
      }
      this.race = userData.race;
      this.class = userData.class;
      this.experience = userData.experience;
      this.gold = userData.gold;

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
    return income;
  }

  get recruitingLink() {
    return md5(this.id.toString());
  }

  get attackBonus() {
    const attack = Bonuses.filter(
      (bonus) =>
        (bonus.race === this.race || bonus.race === this.class) &&
        bonus.bonusType === 'ATTACK'
    ).reduce(function (count, stat) {
      return count + stat.bonusAmount;
    }, 0);
    return attack;
  }

  get defenseBonus(): number {
    const defense = Bonuses.filter(
      (bonus) =>
        (bonus.race === this.race || bonus.race === this.class) &&
        bonus.bonusType === 'DEFENSE'
    ).reduce(function (count, stat) {
      return count + stat.bonusAmount;
    }, 0);
    return defense;
  }

  get intelBonus() {
    const intel = Bonuses.filter(
      (bonus) =>
        (bonus.race === this.race || bonus.race === this.class) &&
        bonus.bonusType === 'INTEL'
    ).reduce(function (count, stat) {
      return count + stat.bonusAmount;
    }, 0);
    return intel;
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

  // TODO: refactor the below Off/Def/Spy/Sentry functions
  getArmyStat(type: UnitType) {
    const Units = this.units?.filter((units) => units.type === type);
    const Weapons = this.items?.filter((weapon) => weapon.unitType === type);
    const UnitCounts = Units.map((unit) => {
      return (
        UnitTypes.find(
          (unitType) =>
            unitType.type === unit.type && unitType.level === unit.level
        ).bonus *
          unit.quantity +
        Weapons.map((weapon) => {
          return (
            WeaponTypes.find(
              (nweapon) =>
                nweapon.type === weapon.type &&
                nweapon.level === unit.level &&
                nweapon.usage === unit.type
            ).bonus *
            (weapon.quantity <= unit.quantity ? weapon.quantity : unit.quantity)
          );
        }).reduce((acc, off) => acc + off, 0) *
          (1 + parseInt(this.attackBonus.toString(), 10) / 100)
      );
    });

    const armyStat = UnitCounts.reduce((acc, off) => acc + off, 0);
    return armyStat;
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

  getLevelFromXP(xp: number): number {
    const level = Math.floor(-2.5 + Math.sqrt(4.25 + 0.002 * xp));
    if (level < 1) return 1;
    return level;
  }

  get level(): number {
    if (this.experience === 0) return 1;

    return this.getLevelFromXP(this.experience);
  }

  get xpToNextLevel(): number {
    const currentLevel = this.level;
    const nextLevelXP = Levels[currentLevel + 1];
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

  get availableDefenseBattleUpgrades(): Fortification[] {
    return Fortifications.filter((fort) => fort.level <= this.fortLevel + 2);
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
