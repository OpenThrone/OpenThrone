import { BattleUpgrades, ItemTypes, UnitTypes } from '@/constants';

export interface ActivityItem {
  kind: 'unit' | 'item' | 'battleUpgrade';
  name: string;
  level: number;
  quantity: number;
  usage?: string;
}
export interface ActivityDetails {
  items: ActivityItem[];
  conversions: { from: ActivityItem; to: ActivityItem; quantity: number }[];
  newLevel?: number;
  repairedHP?: number;
  fromAccount?: 'HAND' | 'BANK';
  toAccount?: 'HAND' | 'BANK';
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Actions that record details; anything else has none to be missing. */
export const recordsActivityDetails = (action: string): boolean =>
  /^(TRAINING_|ARMORY_|BATTLE_UPGRADES_|(HIRE|RENEW)_MERCENARY$|FORT_REPAIR$|PLAYER_TRANSFER$)|_UPGRADE$/.test(
    action,
  );

/** Only catalog identities and transaction quantities leave the staff endpoint.
 * Never return arbitrary history metadata (which can contain private notes).
 */
export function adminActivityDetails(
  action: string,
  source: unknown,
): ActivityDetails | null {
  const envelope = object(source);
  const stats = object(envelope.stats);
  const result: ActivityDetails = { items: [], conversions: [] };
  const kind = action.startsWith('ARMORY_')
    ? 'item'
    : action.startsWith('BATTLE_UPGRADES_')
      ? 'battleUpgrade'
      : 'unit';
  const catalog: {
    name: string;
    type: string;
    level: number;
    usage?: string;
    id?: string;
  }[] =
    kind === 'item' ? ItemTypes : kind === 'unit' ? UnitTypes : BattleUpgrades;
  const resolve = (value: unknown, quantity: unknown): ActivityItem | null => {
    if (!integer(quantity) || quantity === 0) return null;
    const row = object(value);
    const entry = catalog.find((entry) =>
      typeof value === 'string'
        ? kind === 'item'
          ? `${entry.usage}_${entry.id}` === value
          : `${entry.type}_${entry.level}` === value
        : entry.type === row.type &&
          entry.level === row.level &&
          (kind !== 'item' || entry.usage === row.usage),
    );
    return entry
      ? {
          kind,
          name: entry.name,
          level: entry.level,
          quantity,
          ...(kind === 'item' ? { usage: entry.usage } : {}),
        }
      : null;
  };
  if (
    /^(TRAINING_|ARMORY_|BATTLE_UPGRADES_|(HIRE|RENEW)_MERCENARY)/.test(action)
  ) {
    if (Array.isArray(stats.items)) {
      for (const value of stats.items) {
        const item = resolve(value, object(value).quantity);
        if (item) result.items.push(item);
      }
    }
    const conversions = Array.isArray(stats.conversions)
      ? stats.conversions
      : [stats];
    for (const value of conversions) {
      const row = object(value);
      const quantity = row.conversionAmount ?? row.amount;
      const from = resolve(row.fromItem, quantity);
      const to = resolve(row.toItem, quantity);
      if (from && to)
        result.conversions.push({ from, to, quantity: from.quantity });
    }
  }
  if (action.endsWith('_UPGRADE') && integer(stats.new_level))
    result.newLevel = stats.new_level;
  if (action === 'FORT_REPAIR' && integer(stats.actualRepairAmount))
    result.repairedHP = stats.actualRepairAmount;
  if (action === 'PLAYER_TRANSFER') {
    if (envelope.fromAccount === 'HAND' || envelope.fromAccount === 'BANK')
      result.fromAccount = envelope.fromAccount;
    if (envelope.toAccount === 'HAND' || envelope.toAccount === 'BANK')
      result.toAccount = envelope.toAccount;
  }
  return result.items.length ||
    result.conversions.length ||
    result.newLevel !== undefined ||
    result.repairedHP !== undefined ||
    (result.fromAccount && result.toAccount)
    ? result
    : null;
}
