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
  type: string;
  quantity: number;
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
};
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
  StructureUpgradeLevelRequired: number;
  level: number;
  bonus: number;
  cost: number;
  minUnitLevel: number;
  unitsCovered: number;
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
  sentries: number;
};
/**
 * ECONOMY - Gold Per Turn added to the players account.
 * PLAYER_TRANSFER - Funds manually transferred by the player.
 * WAR_SPOILS - Gold via combat (or spying)
 */
export type BankTransferHistoryType =
  | 'ECONOMY'
  | 'PLAYER_TRANSFER'
  | 'WAR_SPOILS';

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
  canonical ?: string;
};

export interface ComposeFormProps {
  onClose: () => void;
}

export type IUserSession  ={ 
  id: number;
  display_name: string;
  class: PlayerClass;
  race: PlayerRace;
  colorScheme: string;
}