import type {
  PlayerUnit,
  Item,
  Unit,
  UnitTotalsType,
  UnitType,
  PlayerItem,
  StructureUpgrade,
} from '@/types/typings';

import {
  UnitTypes,
  ItemTypes,
  SpyUpgrades,
} from '../constants';

export class UserUnitsService {
  private units: PlayerUnit[];
  private items: PlayerItem[];
  private fortLevel: number;
  private structure_upgrades: StructureUpgrade[];
  private mercenaries: PlayerUnit[];

  constructor(userData: {
    units?: PlayerUnit[];
    items?: PlayerItem[];
    fortLevel?: number;
    structure_upgrades?: StructureUpgrade[];
    mercenaries?: PlayerUnit[];
  } = {}) {
    this.units = userData.units ?? [];
    this.items = userData.items ?? [];
    this.fortLevel = userData.fortLevel ?? 0;
    this.structure_upgrades = userData.structure_upgrades ?? [];
    this.mercenaries = userData.mercenaries ?? [];
  }

  getUnitTotals(): UnitTotalsType {
    const totals: UnitTotalsType = {
      citizens: 0, workers: 0, offense: 0, defense: 0,
      spies: 0, sentries: 0, assassins: 0, infiltrators: 0
    };
    this.units.forEach(unit => {
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
    this.mercenaries.forEach(unit => {
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

  getAvailableUnitTypes(): Unit[] {
    const adjustment = this.fortLevel >= 5 ? 4 : 0;
    return UnitTypes.filter(unitType => {
      const requiredFortLevel = unitType.fortLevel ?? 1;
      return requiredFortLevel <= this.fortLevel + adjustment;
    });
  }

  getArmySize(): number {
    return this.units
      .filter((unit) => unit.type !== 'CITIZEN' && unit.type !== 'WORKER')
      .reduce((acc, unit) => acc + (unit.quantity || 0), 0);
  }

  getPopulation(): number {
    return this.units.reduce((acc, unit) => acc + (unit.quantity || 0), 0);
  }

  getCitizens(): number {
    return this.units?.find((unit) => unit.type === 'CITIZEN')?.quantity ?? 0;
  }

  getSortedUnits(type: UnitType): PlayerUnit[] {
    return JSON.parse(JSON.stringify(
      this.units.filter(unit => unit.type === type).sort((a, b) => b.level - a.level)
    ));
  }

  getLevelForUnit(type: UnitType): number {
    if (['OFFENSE', 'DEFENSE', 'SENTRY', 'SPY'].includes(type)) {
      return this.fortLevel;
    }
    return 1;
  }

  getAvailableItemTypes(): Item[] {
    const armoryLvl = this.getArmoryLevel();
    return ItemTypes.filter(item => (item.armoryLevel ?? 1) <= armoryLvl);
  }

  getSpyMissions(): Record<string, { enabled: boolean; requiredLevel: number }> {
    const missions = [
      { name: 'intel', requiredLevel: SpyUpgrades[0]?.level ?? 1 },
      { name: 'infil', requiredLevel: SpyUpgrades.find(u => u.maxInfiltrations > 0)?.level ?? Infinity },
      { name: 'assass', requiredLevel: SpyUpgrades.find(u => u.maxAssassinations > 0)?.level ?? Infinity },
    ];
    const spyLevel = this.getSpyLevel();

    return missions.reduce((acc, mission) => {
      acc[mission.name] = {
        enabled: spyLevel >= mission.requiredLevel,
        requiredLevel: mission.requiredLevel
      };
      return acc;
    }, {} as Record<string, { enabled: boolean; requiredLevel: number }>);
  }

  getSpyLimits(): {
    infil: { perUser: number; perMission: number; perDay: number };
    assass: { perUser: number; perMission: number; perDay: number };
    stats: { level: number; all: typeof SpyUpgrades[number] | undefined }
  } {
    const spyLevel = this.getSpyLevel();
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
        all: currentSpyUpgrade
      }
    };
  }

  private getArmoryLevel(): number {
    return this.structure_upgrades.find(s => s.type === 'ARMORY')?.level ?? 0;
  }

  private getSpyLevel(): number {
    return this.structure_upgrades.find(s => s.type === 'SPY')?.level ?? 0;
  }
}