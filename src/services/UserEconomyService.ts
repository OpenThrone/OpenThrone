import { z } from 'zod';

import type { PlayerUnit } from '@/types/typings';

import { EconomyUpgrades, Fortifications, HouseUpgrades } from '../constants';

const UserDataSchema = z.object({
  gold: z.bigint().optional(),
  goldInBank: z.bigint().optional(),
  units: z.array(z.any()).optional(),
  economyLevel: z.number().int().optional(),
  houseLevel: z.number().int().optional(),
  incomeBonus: z.number().optional(),
  fortLevel: z.number().int().optional(),
});

/** Encapsulates user economy data access and domain operations. */
export class UserEconomyService {
  private gold: bigint;

  private goldInBank: bigint;

  private units: PlayerUnit[];

  private economyLevel: number;

  private houseLevel: number;

  private incomeBonus: number;

  private fortLevel: number;

  constructor(
    userData: {
      gold?: bigint;
      goldInBank?: bigint;
      units?: PlayerUnit[];
      economyLevel?: number;
      houseLevel?: number;
      incomeBonus?: number;
      fortLevel?: number;
    } = {},
  ) {
    const validatedData = UserDataSchema.parse(userData);
    this.gold = validatedData.gold ?? BigInt(0);
    this.goldInBank = validatedData.goldInBank ?? BigInt(0);
    this.units = validatedData.units ?? [];
    this.economyLevel = validatedData.economyLevel ?? 0;
    this.houseLevel = validatedData.houseLevel ?? 0;
    this.incomeBonus = validatedData.incomeBonus ?? 0;
    this.fortLevel = validatedData.fortLevel ?? 0;
  }

  getNetWorth(): bigint {
    return this.gold + this.goldInBank;
  }

  getGoldPerTurn(): bigint {
    const workerUnits = this.units.filter((unit) => unit.type === 'WORKER');
    const economyUpgrade = EconomyUpgrades[this.economyLevel];
    const goldPerWorker = economyUpgrade?.goldPerWorker ?? 0;
    const workerGold = workerUnits.reduce((sum, unit) => {
      const baseWorkerGold = goldPerWorker * (unit.quantity ?? 0);
      const bonusGold = baseWorkerGold * (this.incomeBonus / 100);
      return sum + baseWorkerGold + bonusGold;
    }, 0);

    const fortGold =
      Fortifications.find((f) => f.level === this.fortLevel)?.goldPerTurn ?? 0;
    const fortBonusGold = fortGold * (this.incomeBonus / 100);

    return BigInt(Math.ceil(workerGold + fortGold + fortBonusGold));
  }

  getWorkerGoldPerTurn(): number {
    const workerUnits = this.units.filter((unit) => unit.type === 'WORKER');
    if (workerUnits.length === 0) return 0;

    const economyUpgrade = EconomyUpgrades[this.economyLevel];
    const goldPerWorkerBase = economyUpgrade?.goldPerWorker ?? 0;

    const totalGold = workerUnits.reduce((sum, unit) => {
      const baseGold = goldPerWorkerBase * (unit.quantity ?? 0);
      const bonusGold = baseGold * (this.incomeBonus / 100);
      return sum + baseGold + bonusGold;
    }, 0);

    return totalGold;
  }

  getGoldPerWorkerPerTurn(): number {
    const economyUpgrade = EconomyUpgrades[this.economyLevel];
    const goldPerWorkerBase = economyUpgrade?.goldPerWorker ?? 0;

    return goldPerWorkerBase * (1 + this.incomeBonus / 100);
  }

  getFortificationGoldPerTurn(): number {
    return (
      Fortifications.find((fort) => fort.level === this.fortLevel)
        ?.goldPerTurn ?? 0
    );
  }

  getMaximumBankDeposits(): number {
    const upgrade = EconomyUpgrades[this.economyLevel];
    return upgrade?.depositsPerDay ?? 0;
  }

  getRecruitingBonus(): number {
    const houseBonus =
      HouseUpgrades[this.houseLevel as keyof typeof HouseUpgrades]
        ?.citizensDaily ?? 0;
    // Note: baseBonus from playerBonuses would be passed or injected from StatsService
    // For now, assuming passed as part of incomeBonus or separate; here using 0 as placeholder
    const baseBonus = 0; // To be replaced with getPlayerBonuses filter 'RECRUITING'
    return baseBonus + houseBonus;
  }
}
