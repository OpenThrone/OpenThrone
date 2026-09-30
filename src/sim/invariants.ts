import type { PlayerState } from './types';

export type InvariantReason =
  | 'negative'
  | 'not-finite'
  | 'fractional'
  | 'unsafe-integer';

export interface InvariantContext {
  readonly day: number;
  readonly playerId: string;
}

export interface SimulationInvariantErrorInit {
  readonly day: number;
  readonly playerId: string;
  readonly field: string;
  readonly value: unknown;
  readonly reason: InvariantReason;
}

/**
 * Thrown when a simulated economic quantity fails a numeric invariant.
 *
 * Deterministic balance conclusions are worthless if overflow, NaN, or
 * fractional gold silently propagates through the state machine. This error
 * fails fast and carries day/player/field context so the offending mutation
 * can be traced across a 730-day run.
 */
export class SimulationInvariantError extends Error {
  readonly day: number;

  readonly playerId: string;

  readonly field: string;

  readonly value: unknown;

  readonly reason: InvariantReason;

  constructor(init: SimulationInvariantErrorInit) {
    const valueDescription = describeValue(init.value);
    const message =
      `Invariant violation at day ${init.day} for player ${init.playerId}: ` +
      `field "${init.field}" is ${init.reason} (value=${valueDescription}).`;
    super(message);
    this.name = 'SimulationInvariantError';
    this.day = init.day;
    this.playerId = init.playerId;
    this.field = init.field;
    this.value = init.value;
    this.reason = init.reason;
    Object.setPrototypeOf(this, SimulationInvariantError.prototype);
  }

  toJSON(): SimulationInvariantErrorInit & { message: string; name: string } {
    return {
      name: this.name,
      message: this.message,
      day: this.day,
      playerId: this.playerId,
      field: this.field,
      value: this.value,
      reason: this.reason,
    };
  }
}

function describeValue(value: unknown): string {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    return String(value);
  }
  return String(value);
}

export function assertFinite(
  value: number,
  field: string,
  context: InvariantContext,
): void {
  if (!Number.isFinite(value)) {
    throw new SimulationInvariantError({
      ...context,
      field,
      value,
      reason: 'not-finite',
    });
  }
}

export function assertSafeInteger(
  value: number,
  field: string,
  context: InvariantContext,
): void {
  assertFinite(value, field, context);
  if (!Number.isSafeInteger(value)) {
    if (!Number.isInteger(value)) {
      throw new SimulationInvariantError({
        ...context,
        field,
        value,
        reason: 'fractional',
      });
    }
    throw new SimulationInvariantError({
      ...context,
      field,
      value,
      reason: 'unsafe-integer',
    });
  }
}

export function assertFiniteNonNegative(
  value: number,
  field: string,
  context: InvariantContext,
): void {
  assertFinite(value, field, context);
  if (value < 0) {
    throw new SimulationInvariantError({
      ...context,
      field,
      value,
      reason: 'negative',
    });
  }
}

export function assertFiniteNonNegativeSafeInteger(
  value: number,
  field: string,
  context: InvariantContext,
): void {
  assertFinite(value, field, context);
  if (value < 0) {
    throw new SimulationInvariantError({
      ...context,
      field,
      value,
      reason: 'negative',
    });
  }
  if (!Number.isInteger(value)) {
    throw new SimulationInvariantError({
      ...context,
      field,
      value,
      reason: 'fractional',
    });
  }
  if (!Number.isSafeInteger(value)) {
    throw new SimulationInvariantError({
      ...context,
      field,
      value,
      reason: 'unsafe-integer',
    });
  }
}

/**
 * Validates a gold-class economic quantity (hand gold, bank gold, treasury).
 * Gold is always a non-negative safe integer in production; fractional gold
 * is invalid even though Number allows it.
 */
export function assertGoldQuantity(
  value: number,
  field: string,
  context: InvariantContext,
): void {
  assertFiniteNonNegativeSafeInteger(value, field, context);
}

export function assertPlayerGold(
  player: PlayerState,
  context: InvariantContext,
): void {
  assertGoldQuantity(player.gold, 'gold', context);
  assertGoldQuantity(player.goldInBank, 'goldInBank', context);
}

export function assertScenarioTreasury(
  treasury: number,
  context: InvariantContext,
): void {
  assertGoldQuantity(treasury, 'treasury', context);
}

export class SimulationConfigError extends Error {
  readonly code: string;

  readonly playerId?: string;

  constructor(message: string, code: string, playerId?: string) {
    super(message);
    this.name = 'SimulationConfigError';
    this.code = code;
    this.playerId = playerId;
    Object.setPrototypeOf(this, SimulationConfigError.prototype);
  }
}
