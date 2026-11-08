import type { BattleUnits } from '@/types/typings';

/**
 * Casualty spread (combat-v10, #203).
 *
 * The battle itself is fought on a shadow roster: clones of one side's rows
 * that run the lowest-unit-level-first casualty algorithm for the whole
 * battle (cumulative losses and HP, every cap included). That keeps damage,
 * the casualty budgets, the per-stack cap, the winner, the loot and every
 * per-battle casualty total exactly what the lowest-first engine (combat-v9)
 * produces for the same seed.
 *
 * What spreading changes is only WHO the shadow's dead are charged to. After
 * each turn the shadow's casualty increment, per unit type, is redistributed
 * over the real stacks of that type in proportion to headcount, so a cheap
 * level-1 screen no longer shields the valuable tiers behind it.
 *
 * Rules the spread follows:
 * - Counts, not damage, are redistributed. Unit HP (mercenaries at 0.8, higher
 *   levels) therefore cannot change how many units fall.
 * - A stack is one (type, level, mercenary, contract) key; duplicate rows of
 *   the same stack share one allowance, capped like the shadow's own, at
 *   PER_STACK_CASUALTY_CAP of the stack's starting size (never below one unit).
 *   The shadow respects the same caps stack for stack, so the real roster
 *   always has room for the shadow's increment: totals cannot drift.
 * - A stack's share is its starting headcount, times MERC_LOSS_WEIGHT for
 *   hired mercenaries, so inside every tier hired troops still take the front
 *   line (the same split the shadow uses within a tier).
 * - Units fall one at a time to the stack furthest behind its share (the
 *   Sainte-Lague divisor method), so the split is proportional within one
 *   unit, stays stable from turn to turn and a stack never gives a loss back.
 *   Ties go to the lower tier, which is what lowest-first would have done.
 * - The wounded share of a side's losses is taken from the shadow's totals
 *   and spread over the real stacks the same way, so killed and wounded each
 *   match the lowest-first engine too.
 */

interface CasualtyConstants {
  PER_STACK_CASUALTY_CAP: number;
  MERC_LOSS_WEIGHT: number;
}

interface Stack {
  type: string;
  level: number;
  isMercenary: boolean;
  forceContractId: number | undefined;
  rows: BattleUnits[];
  initial: number;
  /** Starting headcount times the mercenary front-line weight. */
  weight: number;
  /** Most units this stack may lose in one battle. */
  cap: number;
  lost: number;
  entry: BattleUnits | undefined;
}

type LossEntry = Pick<
  BattleUnits,
  'type' | 'level' | 'quantity' | 'isMercenary' | 'forceContractId'
>;

const stackKey = (u: {
  type: string;
  level: number;
  isMercenary?: boolean;
  forceContractId?: number;
}) =>
  `${u.type}\0${u.level}\0${u.isMercenary ? 1 : 0}\0${u.forceContractId ?? ''}`;

/** Spreads one side's casualties from its shadow roster over its real stacks. */
export class SpreadRoster {
  /** Rows the battle is fought on; lowest-first runs here. */
  readonly shadowUnits: BattleUnits[];

  readonly shadowMercenaries: BattleUnits[];

  private readonly realUnits: BattleUnits[];

  private readonly realMercenaries: BattleUnits[];

  private readonly stacks: Stack[] = [];

  private readonly byType = new Map<string, Stack[]>();

  private readonly ledger: BattleUnits[] = [];

  /** Shadow casualties already charged to real stacks, by unit type. */
  private readonly charged = new Map<string, number>();

  constructor(
    units: BattleUnits[],
    mercenaries: BattleUnits[],
    private readonly constants: CasualtyConstants,
  ) {
    this.realUnits = units;
    this.realMercenaries = mercenaries;
    this.shadowUnits = units.map((row) => ({ ...row }));
    this.shadowMercenaries = mercenaries.map((row) => ({ ...row }));

    const byKey = new Map<string, Stack>();
    for (const row of [...units, ...mercenaries]) {
      if ((row.quantity || 0) <= 0) continue;
      const key = stackKey(row);
      let stack = byKey.get(key);
      if (!stack) {
        stack = {
          type: row.type,
          level: row.level,
          isMercenary: !!row.isMercenary,
          forceContractId: row.forceContractId,
          rows: [],
          initial: 0,
          weight: 0,
          cap: 0,
          lost: 0,
          entry: undefined,
        };
        byKey.set(key, stack);
        this.stacks.push(stack);
      }
      stack.rows.push(row);
      stack.initial += row.quantity;
    }
    // Lower tiers first, hired troops before regulars, so ties fall where
    // lowest-first would have sent them.
    this.stacks.sort(
      (a, b) =>
        a.level - b.level ||
        a.type.localeCompare(b.type) ||
        Number(b.isMercenary) - Number(a.isMercenary) ||
        (a.forceContractId ?? 0) - (b.forceContractId ?? 0),
    );
    for (const stack of this.stacks) {
      // Tiny stacks still bleed: the share cap never rounds below one unit.
      stack.cap = Math.max(
        1,
        Math.floor(stack.initial * constants.PER_STACK_CASUALTY_CAP),
      );
      stack.weight =
        stack.initial *
        (stack.isMercenary ? Math.max(0, constants.MERC_LOSS_WEIGHT) || 1 : 1);
      const list = this.byType.get(stack.type) ?? [];
      list.push(stack);
      this.byType.set(stack.type, list);
    }
  }

  /**
   * Charges the shadow's casualties since the last call to real stacks.
   * `shadowLosses` is the shadow's cumulative loss ledger for this side.
   */
  project(shadowLosses: readonly LossEntry[]): void {
    const totals = new Map<string, number>();
    for (const entry of shadowLosses)
      totals.set(
        entry.type,
        (totals.get(entry.type) ?? 0) + Math.max(0, entry.quantity || 0),
      );
    for (const [type, total] of totals) {
      const increment = total - (this.charged.get(type) ?? 0);
      if (increment <= 0) continue;
      this.charged.set(type, total);
      this.charge(this.byType.get(type) ?? [], increment);
    }
  }

  private charge(stacks: Stack[], count: number): void {
    for (let remaining = count; remaining > 0; remaining--) {
      let best: Stack | undefined;
      let bestRatio = Infinity;
      for (const stack of stacks) {
        if (stack.lost >= stack.cap || stack.weight <= 0) continue;
        const ratio = (stack.lost + 0.5) / stack.weight;
        if (ratio < bestRatio) {
          best = stack;
          bestRatio = ratio;
        }
      }
      // The shadow honours the same caps, so the loop above always finds room;
      // this only guards a roster that changed under us.
      best ??= stacks.find((s) => s.lost < s.initial);
      if (!best) return;
      this.take(best);
    }
  }

  private take(stack: Stack): void {
    const row = stack.rows.find((r) => r.quantity > 0);
    if (!row) return;
    row.quantity -= 1;
    stack.lost += 1;
    if (stack.entry) {
      stack.entry.quantity += 1;
      return;
    }
    const first = stack.rows[0];
    stack.entry = {
      forceContractId: stack.forceContractId,
      id: first?.id ?? 0,
      userId: first?.userId ?? 0,
      type: stack.type,
      level: stack.level,
      isMercenary: stack.isMercenary,
      quantity: 1,
    };
    this.ledger.push(stack.entry);
  }

  /** Losses charged to the real stacks, one entry per stack. */
  realLosses(): BattleUnits[] {
    return this.ledger;
  }

  /** Stacks of the given types that sit at their cap with units still alive. */
  cappedStacks(types: ReadonlySet<string>): Array<{
    type: string;
    level: number;
    lost: number;
    initialQuantity: number;
  }> {
    return this.stacks
      .filter(
        (s) =>
          types.has(s.type) &&
          s.lost >= s.cap &&
          s.rows.some((row) => row.quantity > 0),
      )
      .map((s) => ({
        type: s.type,
        level: s.level,
        lost: s.lost,
        initialQuantity: s.initial,
      }));
  }

  /** Hands the real rows back to the user, without emptied ones. */
  restore(user: { units?: BattleUnits[]; mercenaries?: BattleUnits[] }): void {
    user.units = this.realUnits.filter((row) => (row.quantity || 0) > 0);
    user.mercenaries = this.realMercenaries.filter(
      (row) => (row.quantity || 0) > 0,
    );
  }
}

/**
 * Wounded count per unit type the lowest-first engine produces: each loss
 * entry gives up floor(quantity * share) as wounded.
 */
export function shadowWoundedByType(
  shadowLosses: readonly LossEntry[],
  share: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of shadowLosses)
    out.set(
      entry.type,
      (out.get(entry.type) ?? 0) + Math.floor(entry.quantity * share),
    );
  return out;
}

/**
 * Splits `wounded` units over loss entries in proportion to their size
 * (largest remainder), so the wounded total is exactly the lowest-first one
 * and no entry gives up more than it lost.
 */
export function allocateWounded(
  entries: readonly LossEntry[],
  wounded: number,
): number[] {
  const total = entries.reduce((sum, e) => sum + e.quantity, 0);
  if (total <= 0 || wounded <= 0) return entries.map(() => 0);
  const target = Math.min(wounded, total);
  const exact = entries.map((e) => (e.quantity * target) / total);
  const shares = exact.map((x) => Math.floor(x));
  let left = target - shares.reduce((sum, n) => sum + n, 0);
  const order = exact
    .map((x, i) => ({ i, fraction: x - Math.floor(x) }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    if ((shares[i] ?? 0) < (entries[i]?.quantity ?? 0)) {
      shares[i] = (shares[i] ?? 0) + 1;
      left -= 1;
    }
  }
  return shares;
}

/**
 * Wounded share of every loss entry, allocated within each unit type so a
 * type's killed and wounded counts are the lowest-first engine's too.
 */
export function allocateWoundedByType(
  entries: readonly LossEntry[],
  woundedByType: ReadonlyMap<string, number>,
): number[] {
  const shares = entries.map(() => 0);
  for (const [type, wounded] of woundedByType) {
    const indexes = entries.flatMap((e, i) => (e.type === type ? [i] : []));
    const split = allocateWounded(
      indexes.map((i) => entries[i] as LossEntry),
      wounded,
    );
    indexes.forEach((entryIndex, k) => {
      shares[entryIndex] = split[k] ?? 0;
    });
  }
  return shares;
}
