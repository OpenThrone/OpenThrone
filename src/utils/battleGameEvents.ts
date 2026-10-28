import { z } from 'zod';

import { GameEventEffectsSchema } from '@/constants/gameEvents';

const SnapshotSchema = z.object({
  version: z.literal(1),
  capturedAt: z.string().datetime(),
  events: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().max(200),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime().nullable(),
        effects: GameEventEffectsSchema,
      }),
    )
    .max(100),
  appliedXpMultiplier: z.number().finite().min(0.1).max(10),
});

export type BattleGameEvents = z.infer<typeof SnapshotSchema>;

/** Only public event facts, never administrative config or player state. */
export function readBattleGameEvents(value: unknown): BattleGameEvents | null {
  const parsed = SnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
