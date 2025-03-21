import { PrismaClient } from '@prisma/client';
declare global {
  var prisma: PrismaClient | undefined;
}
export type PlayerRace = 'UNDEAD' | 'HUMAN' | 'GOBLIN' | 'ELF' | 'ALL';
export type PlayerClass = 'FIGHTER' | 'CLERIC' | 'ASSASSIN' | 'THIEF';
export type UnitType =
  | 'CITIZEN'
  | 'WORKER'
  | 'OFFENSE'
  | 'DEFENSE'
  | 'SPY'
  | 'SENTRY';
export type ItemType =
  | 'WEAPON'
  | 'HELM'
  | 'ARMOR'
  | 'BOOTS'
  | 'BRACERS'
  | 'SHIELD';
export type BonusType =
  | 'OFFENSE'
  | 'DEFENSE'
  | 'RECRUITING'
  | 'CASUALTY'
  | 'INTEL'
  | 'INCOME'
  | 'PRICES';
export type Locales = 'en-US' | 'es-ES';
export type BattleUnits = {
  type: UnitType | string;
  quantity: number;
  level?: number;
};

export interface PageAlert {
  type: 'SUCCESS' | 'DANGER' | 'INFO';
  message: string;
}
export interface BattleUpgradeProps {
  userLevel: number;
  fortLevel: number;
  forceUpdate: () => void;
}

export type CasualtiesResult = {
  attackerCasualties: AttackPlayerUnit[];
  defenderCasualties: AttackPlayerUnit[];
};

export type SidebarData = {
  gold: string;
  citizens: string;
  level: string;
  experience: string;
  xpToNextLevel: string;
  attackTurns: string;
};

export type PlayerUnit = {
  level: number;
  type: UnitType;
  quantity: number;
};

export type AttackPlayerUnit = {
  level: number;
  type: UnitType;
  quantity: number;
  casualties: number;
};

export type BonusPointsItem = {
  type: BonusType;
  level: number;
};
export type FortHealth = {
  current: number;
  max: number;
  percentage: number;
};
export type Unit = {
  name: string;
  type: UnitType;
  level: number;
  bonus: number;
  cost: number;
  fortLevel: number;
  hp: number;
  killingStrength?: number;
  defenseStrength?: number;
};
export interface ItemCounts {
  [key: string]: number; // This allows any string as a key and number as its value
}
export type Item = {
  name: string;
  usage: UnitType;
  type: ItemType;
  level: number;
  bonus: number;
  cost: number;
  race: PlayerRace;
  quantity: number;
  armoryLevel: number;
  killingStrength?: number;
  defenseStrength?: number;
};

export type PlayerItem = {
  usage: UnitType;
  type: ItemType;
  level: number;
  quantity: number;
}
export type PlayerBattleUpgrade = {
  type: UnitType;
  level: number;
  quantity: number;
}
export type Fortification = {
  name: string;
  level: number;
  levelRequirement: number;
  hitpoints: number;
  costPerRepairPoint: number;
  goldPerTurn: number;
  defenseBonusPercentage: number;
  cost: number;
};
export type OffensiveUpgradeType = {
  name: string;
  fortLevelRequirement: number;
  offenseBonusPercentage: number;
  cost: number;
  level: number;
};
export type DefensiveUpgradeType = {
  name: string;
  fortLevelRequirement: number;
  defenseBonusPercentage: number;
  cost: number;
  level: number;
};
export type SpyUpgradeType = {
  name: string;
  fortLevelRequirement: number;
  offenseBonusPercentage: number;
  maxInfiltrations: number;
  maxAssassinations: number;
  maxInfiltratorsPerMission: number;
  maxInfiltratorsPerUser: number;
  maxAssassinsPerMission: number;
  maxAssassinationsPerUser: number;
  cost: number;
  level: number;
};

export type SentryUpgradeType = {
  name: string;
  fortLevelRequirement: number;
  defenseBonusPercentage: number;
  cost: number;
};

export type UnitUpgradeType = {
  type: UnitType;
  name: string;
  SiegeUpgradeLevel: number;
  level: number;
  bonus: number;
  cost: number;
  minUnitLevel: number;
  unitsCovered: number;
  quantity?: number;
  killingStrength?: number;
  defenseStrength?: number;
};
export type PlayerBonus = {
  race: PlayerRace | PlayerClass;
  bonusType: BonusType;
  bonusAmount: number;
};
export type BankAccountType = 'HAND' | 'BANK';
export type UnitTotalsType = {
  citizens: number;
  workers: number;
  offense: number;
  defense: number;
  spies: number;
  assassins: number;
  infiltrators: number;
  sentries: number;
};
/**
 * ECONOMY - Gold Per Turn added to the players account.
 * PLAYER_TRANSFER - Funds manually transferred by the player.
 * WAR_SPOILS - Gold via combat (or spying)
 * SALE - Gold from buying/selling items and (un)training units
 * RECRUITMENT - Gold from recruiting units
 */
export type BankTransferHistoryType =
  | 'ECONOMY'
  | 'PLAYER_TRANSFER'
  | 'WAR_SPOILS'
  | 'SALE'
  | 'RECRUITMENT';

export type UnitProps = {
  requirement?: string;
  id: string;
  name: string;
  bonus?: number;
  ownedItems: number;
  cost: string;
  enabled: boolean;
  level?: number;
  type: string;
  fortName: string;
  armoryLevel?: number;
  usage?: UnitType;
  minUnitLevel?: number;
  unitsCovered?: number;
};

export type UnitSectionProps = {
  heading: string;
  items: UnitProps[];
  updateTotalCost: (costChange: number) => void; // New prop
  type?: string;
};

export type IMetaProps = {
  title: string;
  description: string;
  canonical?: string;
};

export interface ComposeFormProps {
  onClose: () => void;
}

export type IUserSession = {
  id: number;
  display_name: string;
  class: PlayerClass;
  race: PlayerRace;
  colorScheme: string;
}

export interface Log {
  id: string;
  winner: string;
  attacker_id: string;
  defender_id: string;
  attackerPlayer?: { display_name: string, id: number };
  defenderPlayer?: { display_name: string, id: number };
  timestamp: string;
  stats: Stats;
  type: string;
}

export interface Loss {
  total: number;
  units: BattleUnits[];
}

export interface User {
  id: number;
  email: string;
  display_name: string;
  password_hash?: string;
  race: PlayerRace;
  class: PlayerClass;
  units: PlayerUnit[];
  experience: number;
  gold: bigint;
  gold_in_bank: bigint;
  fort_level: number;
  fort_hitpoints: number;
  attack_turns: number;
  last_active?: Date;
  rank: number;
  items: PlayerItem[];
  house_level: number;
  economy_level: number;
  offense: number;
  defense: number;
  spy: number;
  sentry: number;
  battle_upgrades: PlayerBattleUpgrade[];
  structure_upgrades: StructureUpgrade[];
  bonus_points: BonusPoint[];
  stats: any[];
  bio: string;
  colorScheme?: string;
  recruit_link: string;
  locale: string;
  avatar?: string;
  created_at: Date;
  updated_at: Date;
}

export type SpyCasualtiesParams = {
  attackerKS: number;
  defenderDS: number;
  defenderKS: number;
  attackerDS: number;
  attackerPop: number;
  defenderPop: number;
  maxMultiplier?: number; // Optional, defaults to 3
};

export interface ShareableArmyData {
  race: string;
  experience: number;
  units: any[];
  items: any[];
  battle_upgrades: any[];
  structure_upgrades: any[];
  fort_level ?: number;
  fort_hitpoints ?: number;
};