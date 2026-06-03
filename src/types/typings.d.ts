import type {
  AccountStatus,
  PermissionType,
  PrismaClient,
  User as PrismaUser,
} from '@prisma/client'; // Import PrismaUser alias

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
export type ItemUsage = 'OFFENSE' | 'DEFENSE';
export type BattleUpgradeType = 'OFFENSE' | 'DEFENSE' | 'SPY' | 'SENTRY';
export type BonusType =
  | 'OFFENSE'
  | 'DEFENSE'
  | 'RECRUITING'
  | 'CASUALTY'
  | 'INTEL'
  | 'INCOME'
  | 'PRICES';
export type Locales = 'en-US' | 'es-ES' | 'de-DE';

// Specific type for units stored in User.units JSON
export type PlayerUnit = {
  id: number;
  userId: number;
  level: number;
  type: UnitType;
  quantity: number;
  isMercenary: boolean;
};

// Specific type for items stored in User.items JSON
export type PlayerItem = {
  id: number;
  userId: number;
  usage: ItemUsage;
  type: ItemType;
  level: number;
  quantity: number;
};

// Specific type for battle upgrades stored in User.battle_upgrades JSON
export type PlayerBattleUpgrade = {
  id: number;
  userId: number;
  type: BattleUpgradeType;
  level: number;
  quantity: number;
};

// Specific type for structure upgrades stored in User.structure_upgrades JSON
export type StructureUpgrade = {
  id: number;
  userId: number;
  type: 'OFFENSE' | 'SPY' | 'SENTRY' | 'ARMORY';
  level: number;
};

// Specific type for bonus points stored in User.bonus_points JSON
export type BonusPointsItem = {
  type: BonusType;
  level: number;
};

export interface PlayerStat {
  type: 'OFFENSE' | 'DEFENSE' | 'SPY' | 'SENTRY';
  subtype: 'WON' | 'LOST' | string; // Allow for other subtypes if needed
  stat: any;
}

export type BattleUnits = {
  id: number; // From UserUnit
  userId: number; // From UserUnit
  type: UnitType | string;
  level: number; // Required for PlayerUnit, so make it required here
  quantity: number;
  isMercenary: boolean; // From UserUnit
  currentHP?: number; // Add current HP for tracking during battle
};

export type Loss = {
  total: number;
  units: BattleUnits[];
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

export type AttackPlayerUnit = {
  level: number;
  type: UnitType;
  quantity: number;
  casualties: number; // Assuming this is part of the structure, otherwise remove
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
  MeleeAtkPower?: number;
  MeleeDefPower?: number;
  RangedAtkPower?: number;
  RangedDefPower?: number;
  closeCombatPercentage?: number;
  rangedPercentage?: number;
};
export interface ItemCounts {
  [key: string]: number;
}
export type Item = {
  id: string; // Now includes usage prefix (e.g., 'OFFENSE_DAGGER')
  name: string;
  usage: UnitType | string; // Allow string for flexibility
  type: ItemType;
  level: number;
  bonus: number;
  cost: number;
  race: PlayerRace;
  armoryLevel: number;
  MeleeAtkPower?: number;
  MeleeDefPower?: number;
  RangedAtkPower?: number;
  RangedDefPower?: number;
};

export type UnitUpgradeType = {
  type: UnitType | string;
  name: string;
  SiegeUpgradeLevel: number;
  level: number;
  cost: number;
  minUnitLevel: number;
  unitsCovered: number;
  quantity?: number;
  killingStrength?: number;
  defenseStrength?: number;
  closeCombatPercentage?: number;
  rangedPercentage?: number;
  MeleeAtkPower?: number;
  MeleeDefPower?: number;
  RangedAtkPower?: number;
  RangedDefPower?: number;
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
  casualtyMitigation: number;
  MeleeDefPower?: number; // Forts have defense power
  RangedDefPower?: number; // Forts have ranged defense power
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
  maxInfiltratorsPerMission: number;
  maxInfiltratorsPerUser: number;
  maxAssassinsPerMission: number;
  maxAssassinationsPerUser: number;
  maxAssassinations: number;
  cost: number;
  level: number;
};

export type SentryUpgradeType = {
  name: string;
  fortLevelRequirement: number;
  defenseBonusPercentage: number;
  cost: number;
  level?: number;
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
  | 'RECRUITMENT'
  | 'FORT_REPAIR'
  | 'DAILY_RECRUIT'
  | 'FRIEND_TRANSFER'
  | 'FRIEND_REQUEST';

export type UnitProps = {
  requirement?: string;
  id: string;
  name: string;
  bonus?: number;
  ownedUnits?: number;
  ownedItems?: number;
  cost: string;
  enabled: boolean;
  level?: number;
  type: string;
  fortName?: string;
  armoryLevel?: number;
  usage?: UnitType | string;
  minUnitLevel?: number;
  unitsCovered?: number;
  quantity?: number; //
  SiegeUpgrade?: string;
};

export type UnitSectionProps = {
  heading: string;
  items: UnitProps[];
  updateTotalCost?: (costChange: number) => void;
  type?: string;
  units?: any;
  itemCosts?: { [key: string]: number };
  setItemCosts?: React.Dispatch<
    React.SetStateAction<{ [key: string]: number }>
  >; //
  locale?: Locales;
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
  colorScheme: string | null; // Allow null
  impersonatedBy?: number;
};

export interface Log {
  id: number; // Changed to number based on Prisma schema
  winner: number; // Changed to number
  attacker_id: number; // Changed to number
  defender_id: number; // Changed to number
  attackerPlayer?: { display_name: string; id: number; race?: string }; // Added optional race
  defenderPlayer?: { display_name: string; id: number; race?: string }; // Added optional race
  timestamp: string; // Keep as string after serialization
  stats: any; // Keep as any for now, complex structure
  type: string;
  acl?: any[]; // Add acl field based on prisma include
}

export interface ShareableArmyData {
  race: string;
  experience: number;
  units: PlayerUnit[]; // Use specific type
  items: PlayerItem[]; // Use specific type
  battle_upgrades: PlayerBattleUpgrade[]; // Use specific type
  structure_upgrades: StructureUpgrade[]; // Use specific type
  fort_level?: number;
  fort_hitpoints?: number;
}

// DTO for /api/general/getUser response
// Matches Prisma select + calculated fields
export interface UserApiResponse {
  id: number;
  display_name: string;
  race: PlayerRace;
  class: PlayerClass;
  experience: number;
  gold: string; // Serialized BigInt
  gold_in_bank: string; // Serialized BigInt
  fort_level: number;
  fort_hitpoints: number;
  house_level: number;
  attack_turns: number;
  UserUnit: any[]; // Temporarily any to allow UserUnit[]
  UserItem: any[]; // Temporarily any to allow UserItem[]
  last_active: string; // Serialized Date
  bio: string;
  colorScheme: string | null;
  economy_level: number;
  avatar: string | null;
  UserStructureUpgrade: any[]; // Temporarily any to allow UserStructureUpgrade[]
  UserBattleUpgrade: any[]; // Temporarily any to allow UserBattleUpgrade[]
  UserBonusPoints: any[]; // Temporarily any to allow UserBonusPoints[]
  locale: Locales;
  stats: PlayerStat[]; // Use specific type
  permissions: { type: PermissionType }[];
  // Calculated fields added by the API:
  beenAttacked: boolean;
  detectedSpy: boolean;
  won_attacks: number;
  won_defends: number;
  totalAttacks: number;
  totalDefends: number;
  currentStatus: AccountStatus | string; // Use AccountStatus enum
  goldPerTurn: number;
  depositsAvailable: number;
  nextDepositAvailable: { hours: number; minutes: number; seconds: number } | 0;
  alliance_memberships?: {
    alliance_id: number;
    role_id: number;
    alliance: { name: string };
    role: { name: string };
  }[];
  currentEra?: {
    id: number;
    name: string;
    startDate: string;
    endDate: string | null;
  };
}

// Define the Prisma User type alias again for internal use if needed
export type User = PrismaUser;
export interface ChatMessage {
  id: number;
  roomId: number;
  senderId: number;
  content: string;
  messageType: string;
  sentAt: string; // ISO string
  sender: {
    id: number;
    display_name: string;
    avatar: string | null;
    is_online: boolean;
  };
  reactions: {
    userId: number;
    reaction: string;
    userDisplayName: string;
  }[];
  readBy: {
    userId: number;
    readAt: string; // ISO string
    userDisplayName: string;
  }[];
  replyToMessage: {
    id: number;
    content: string;
    sender: { id: number; display_name: string };
  } | null;
  sharedAttackLog: {
    id: number;
    attacker_id: number;
    defender_id: number;
    winner: number;
    timestamp: string | null; // ISO string
  } | null;
  isOptimistic?: boolean;
  tempId?: number;
}

export interface FrontendRoom {
  id: number;
  name: string | null;
  isPrivate: boolean;
  isDirect: boolean;
  createdById: number;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  lastMessage: string | null;
  lastMessageTime: string | null; // ISO string
  lastMessageSender: string | null;
  unreadCount: number;
  isAdmin: boolean;
  participants: {
    id: number;
    role: 'ADMIN' | 'MEMBER';
    canWrite: boolean;
    display_name: string;
    avatar: string | null;
    is_online: boolean;
  }[];
}
