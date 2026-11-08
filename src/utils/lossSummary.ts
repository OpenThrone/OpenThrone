/** Unit stack as loss rows actually carry it; redacted logs strip id/owner. */
export interface LossUnitStack {
  type: string;
  level: number;
  quantity: number;
  isMercenary?: boolean;
}

/** Loss entries arrive as objects (redacted logs) or JSON strings (legacy rows). */
export type LossesInput =
  | string
  | { total?: number; units?: LossUnitStack[] }
  | null
  | undefined;

export interface BattleLossSummary {
  /** Every casualty in this entry, citizens and workers included. */
  total: number;
  /**
   * The unit type behind the loss when exactly one regular unit was lost, so
   * the report can name it ("You lost 1 Defense unit."). Null for larger or
   * mixed losses, which stay generic (#284).
   */
  unitType: string | null;
}

/** Capitalized fallback for unit types that have no translation. */
export const unitTypeFallbackLabel = (type: string): string =>
  type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();

const parseLosses = (losses: LossesInput) => {
  if (typeof losses === 'string') {
    try {
      return JSON.parse(losses) as { total?: unknown; units?: unknown };
    } catch {
      return null;
    }
  }
  return losses ?? null;
};

/**
 * Reads a battle loss entry for report copy: the casualty total and, when the
 * whole loss is one regular unit, its type. Never throws on malformed rows.
 */
export function summarizeBattleLosses(losses: LossesInput): BattleLossSummary {
  const parsed = parseLosses(losses);
  const total = Number(parsed?.total) || 0;
  const rawUnits = parsed?.units;
  const units: LossUnitStack[] = Array.isArray(rawUnits)
    ? (rawUnits as LossUnitStack[])
    : [];
  const single = total === 1 && units.length === 1 ? units[0] : null;
  const unitType =
    single &&
    Number(single.quantity) === 1 &&
    !single.isMercenary &&
    typeof single.type === 'string'
      ? single.type
      : null;
  return { total, unitType };
}
