import type { UnitType } from '@/types/typings';

/** Fired by the tutorial; the Training page fills its order form in response. */
export const TRAINING_PRESET_EVENT = 'openthrone:training-preset';

/**
 * Fired by the tutorial to train the order on screen. `done` reports whether
 * the Training page accepted it, so the tour only moves on after a real train.
 */
export const TRAINING_TRAIN_EVENT = 'openthrone:training-train';

export type TrainingTrainDetail = { done: (trained: boolean) => void };

export type TrainingPresetId = 'steady' | 'balanced' | 'raider';

type PresetShares = Partial<Record<UnitType, number>>;

/** Share of the starting citizens sent to each role. Each preset sums to 1. */
export const TRAINING_PRESETS: Record<TrainingPresetId, PresetShares> = {
  // Income and safety first; attack once the economy runs.
  steady: { WORKER: 0.5, DEFENSE: 0.5 },
  balanced: { WORKER: 0.4, DEFENSE: 0.3, OFFENSE: 0.3 },
  raider: { WORKER: 0.25, DEFENSE: 0.25, OFFENSE: 0.5 },
};

export const TRAINING_PRESET_IDS = Object.keys(
  TRAINING_PRESETS,
) as TrainingPresetId[];

export const isTrainingPresetId = (value: unknown): value is TrainingPresetId =>
  typeof value === 'string' && value in TRAINING_PRESETS;

export type PresetUnit = {
  readonly id: string;
  readonly type: UnitType;
  readonly cost: number;
};

/**
 * Splits what the player can afford across roles. Orders never exceed the
 * untrained citizens or the gold on hand, so the result can be trained as is.
 * `units` holds one trainable unit per role (the Training page passes level 1).
 */
export const buildPresetOrder = (
  preset: TrainingPresetId,
  options: {
    readonly citizens: number;
    readonly gold: number;
    readonly units: readonly PresetUnit[];
  },
): Record<string, number> => {
  const shares = TRAINING_PRESETS[preset];
  const chosen = options.units.filter(
    (unit) => (shares[unit.type] ?? 0) > 0 && unit.cost >= 0,
  );
  const shareTotal = chosen.reduce(
    (sum, unit) => sum + (shares[unit.type] ?? 0),
    0,
  );
  if (shareTotal <= 0 || options.citizens <= 0) return {};

  const costPerCitizen = chosen.reduce(
    (sum, unit) => sum + ((shares[unit.type] ?? 0) / shareTotal) * unit.cost,
    0,
  );
  const affordable =
    costPerCitizen > 0 ? options.gold / costPerCitizen : options.citizens;
  const total = Math.max(0, Math.min(options.citizens, affordable));

  const order: Record<string, number> = {};
  for (const unit of chosen) {
    const quantity = Math.floor(
      ((shares[unit.type] ?? 0) / shareTotal) * total,
    );
    if (quantity > 0) order[unit.id] = quantity;
  }
  return order;
};
