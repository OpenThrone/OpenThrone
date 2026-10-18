import type { TFunction } from 'i18next';

/** Translation keys (alliances namespace) for player races. */
const RACE_KEYS: Record<string, string> = {
  ELF: 'player.races.ELF',
  HUMAN: 'player.races.HUMAN',
  UNDEAD: 'player.races.UNDEAD',
  GOBLIN: 'player.races.GOBLIN',
};

/** Translation keys (alliances namespace) for player classes. */
const CLASS_KEYS: Record<string, string> = {
  FIGHTER: 'player.classes.FIGHTER',
  CLERIC: 'player.classes.CLERIC',
  THIEF: 'player.classes.THIEF',
  ASSASSIN: 'player.classes.ASSASSIN',
};

/** Translation keys (alliances namespace) for treasury transaction types. */
const TRANSACTION_TYPE_KEYS: Record<string, string> = {
  DEPOSIT: 'bank.types.DEPOSIT',
  WITHDRAWAL: 'bank.types.WITHDRAWAL',
  TAX: 'bank.types.TAX',
  FEE: 'bank.types.FEE',
  LOAN: 'bank.types.LOAN',
  LOAN_REPAYMENT: 'bank.types.LOAN_REPAYMENT',
};

const lookup = (
  t: TFunction,
  keys: Record<string, string>,
  value: string | null | undefined,
) => {
  if (!value) return '';
  const key = keys[value.toUpperCase()];
  // Unknown values fall back to the raw value rather than a missing key.
  return key ? t(key) : value;
};

/** Localised race name; expects the `alliances` namespace `t`. */
export const raceLabel = (t: TFunction, race: string | null | undefined) =>
  lookup(t, RACE_KEYS, race);

/** Localised class name; expects the `alliances` namespace `t`. */
export const classLabel = (t: TFunction, cls: string | null | undefined) =>
  lookup(t, CLASS_KEYS, cls);

/** Localised transaction type; expects the `alliances` namespace `t`. */
export const transactionTypeLabel = (
  t: TFunction,
  type: string | null | undefined,
) => lookup(t, TRANSACTION_TYPE_KEYS, type);
