import type { BonusPointsItem, PlayerBonus } from '@/types/typings';

export const Bonuses: PlayerBonus[] = [
  { race: 'HUMAN', bonusType: 'OFFENSE', bonusAmount: 5 },
  { race: 'GOBLIN', bonusType: 'DEFENSE', bonusAmount: 5 },
  { race: 'UNDEAD', bonusType: 'OFFENSE', bonusAmount: 5 },
  { race: 'ELF', bonusType: 'DEFENSE', bonusAmount: 5 },
  { race: 'FIGHTER', bonusType: 'OFFENSE', bonusAmount: 5 },
  { race: 'CLERIC', bonusType: 'DEFENSE', bonusAmount: 5 },
  { race: 'THIEF', bonusType: 'INCOME', bonusAmount: 5 },
  { race: 'ASSASSIN', bonusType: 'INTEL', bonusAmount: 5 },
];

export const DefaultLevelBonus: BonusPointsItem[] = [
  {
    type: 'OFFENSE',
    level: 0,
  },
  { type: 'DEFENSE', level: 0 },
  { type: 'INTEL', level: 0 },
  { type: 'PRICES', level: 0 },
  { type: 'INCOME', level: 0 },
];
