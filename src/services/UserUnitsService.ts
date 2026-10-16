import { z } from 'zod';

import type {
  UserItem,
  UserStructureUpgrade,
  UserUnit,
} from '@/lib/prisma-exports';
import type {
  Item,
  Unit,
  UnitTotalsType,
  UnitType as TUnitType, // Renaming to avoid conflict with enum
} from '@/types/typings';

import { ItemTypes, SpyUpgrades, UnitTypes } from '../constants';

const UserDataSchema = z.object({
  units: z.array(z.any()).optional(),
  items: z.array(z.any()).optional(),
  fortLevel: z.number().int().optional(),
  structure_upgrades: z.array(z.any()).optional(),
  mercenaries: z.array(z.any()).optional(),
});

/** Encapsulates user units data access and domain operations. */
export class UserUnitsService {
  private units: UserUnit[];

  private items: UserItem[];

  private fortLevel: number;

  private structure_upgrades: UserStructureUpgrade[];

  private mercenaries: UserUnit[];

  constructor(
    userData: {
      units?: UserUnit[];
      items?: UserItem[];
      fortLevel?: number;
      structure_upgrades?: UserStructureUpgrade[];
      mercenaries?: UserUnit[];
    } = {},
  ) {
    const validatedData = UserDataSchema.parse(userData);
    this.units = validatedData.units ?? [];
    this.items = validatedData.items ?? [];
    this.fortLevel = validatedData.fortLevel ?? 0;
    this.structure_upgrades = validatedData.structure_upgrades ?? [];
    this.mercenaries = validatedData.mercenaries ?? [];
  }

  getUnitTotals(): UnitTotalsType {
    const totals: UnitTotalsType = {
      citizens: 0,
      workers: 0,
      offense: 0,
      defense: 0,
      spies: 0,
      sentries: 0,
      assassins: 0,
      infiltrators: 0,
    };

    const processUnits = (units: UserUnit[]) => {
      units.forEach((unit) => {
        const quantity = unit.quantity || 0;
        switch (unit.type) {
          case 'CITIZEN':
            totals.citizens += quantity;
            break;
          case 'WORKER':
            totals.workers += quantity;
            break;
          case 'OFFENSE':
            totals.offense += quantity;
            break;
          case 'DEFENSE':
            totals.defense += quantity;
            break;
          case 'SPY':
            totals.spies += quantity;
            if (unit.level === 2) totals.infiltrators += quantity;
            if (unit.level === 3) totals.assassins += quantity;
            break;
          case 'SENTRY':
            totals.sentries += quantity;
            break;
        }
      });
    };

    // Process both regular units and mercenaries
    processUnits(this.units);
    processUnits(this.mercenaries);

    return totals;
  }

  getAvailableUnitTypes(): Unit[] {
    const adjustment = this.fortLevel >= 5 ? 4 : 0;
    return UnitTypes.filter((unitType) => {
      const requiredFortLevel = unitType.fortLevel ?? 1;
      return requiredFortLevel <= this.fortLevel + adjustment;
    });
  }

  getArmySize(): number {
    const allUnits = [...this.units, ...this.mercenaries];
    return allUnits
      .filter(
        (unit) =>
          unit.type && unit.type !== 'CITIZEN' && unit.type !== 'WORKER',
      )
      .reduce((acc, unit) => acc + (unit.quantity || 0), 0);
  }

  getPopulation(): number {
    const allUnits = [...this.units, ...this.mercenaries];
    return allUnits.reduce((acc, unit) => acc + (unit.quantity || 0), 0);
  }

  getCitizens(): number {
    const allUnits = [...this.units, ...this.mercenaries];
    return allUnits?.find((unit) => unit.type === 'CITIZEN')?.quantity ?? 0;
  }

  getSortedUnits(type: TUnitType): UserUnit[] {
    const allUnits = [...this.units, ...this.mercenaries];
    return JSON.parse(
      JSON.stringify(
        allUnits
          .filter((unit) => unit.type === type)
          .sort((a, b) => (b.level || 0) - (a.level || 0)),
      ),
    );
  }

  getLevelForUnit(type: TUnitType): number {
    if (['OFFENSE', 'DEFENSE', 'SENTRY', 'SPY'].includes(type)) {
      return this.fortLevel;
    }
    return 1;
  }

  getAvailableItemTypes(): Item[] {
    const armoryLvl = this.getArmoryLevel();
    return ItemTypes.filter((item) => (item.armoryLevel ?? 1) <= armoryLvl);
  }

  getSpyMissions(): Record<
    string,
    { enabled: boolean; requiredLevel: number }
  > {
    const missions = [
      { name: 'intel', requiredLevel: SpyUpgrades[0]?.level ?? 1 },
      {
        name: 'infil',
        requiredLevel:
          SpyUpgrades.find((u) => u.maxInfiltrations > 0)?.level ?? Infinity,
      },
      {
        name: 'assass',
        requiredLevel:
          SpyUpgrades.find((u) => u.maxAssassinations > 0)?.level ?? Infinity,
      },
    ];
    const spyLevel = this.getSpyLevel();

    return missions.reduce(
      (acc, mission) => {
        acc[mission.name] = {
          enabled: spyLevel >= mission.requiredLevel,
          requiredLevel: mission.requiredLevel,
        };
        return acc;
      },
      {} as Record<string, { enabled: boolean; requiredLevel: number }>,
    );
  }

  getSpyLimits(): {
    infil: { perUser: number; perMission: number; perDay: number };
    assass: { perUser: number; perMission: number; perDay: number };
    stats: { level: number; all: (typeof SpyUpgrades)[number] | undefined };
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
        all: currentSpyUpgrade,
      },
    };
  }

  private getArmoryLevel(): number {
    return this.structure_upgrades.find((s) => s.type === 'ARMORY')?.level ?? 1;
  }

  private getSpyLevel(): number {
    return this.structure_upgrades.find((s) => s.type === 'SPY')?.level ?? 0;
  }
}
