import { z } from 'zod';

export const eraStartSettingsSchema = z.object({
  gold: z
    .string()
    .regex(/^\d+$/, 'Gold must be a non-negative integer string')
    .refine((val) => {
      try {
        return BigInt(val) <= 1_000_000_000_000n;
      } catch {
        return false;
      }
    }, 'Gold must be at most 1,000,000,000,000'),
  citizens: z
    .number()
    .int('Citizens must be an integer')
    .min(0, 'Citizens must be at least 0')
    .max(10_000_000, 'Citizens must be at most 10,000,000'),
  attackTurns: z
    .number()
    .int('Attack turns must be an integer')
    .min(0, 'Attack turns must be at least 0')
    .max(10_000, 'Attack turns must be at most 10,000'),
});

export type EraStartSettings = z.infer<typeof eraStartSettingsSchema>;

export const DEFAULT_ERA_START_SETTINGS: EraStartSettings = {
  gold: '25000',
  citizens: 50,
  attackTurns: 50,
};

export const startEraBodySchema = z.object({
  startSettings: eraStartSettingsSchema.optional(),
  /** The era the admin is ending; a stale or repeated request is refused. */
  expectedEraId: z.number().int().positive().optional(),
});

export function resolveEraStartSettings(raw: unknown): EraStartSettings {
  let target = raw;
  if (typeof target === 'string') {
    try {
      target = JSON.parse(target);
    } catch {
      return { ...DEFAULT_ERA_START_SETTINGS };
    }
  }

  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    return { ...DEFAULT_ERA_START_SETTINGS };
  }

  const record = target as Record<string, unknown>;

  const goldParsed = eraStartSettingsSchema.shape.gold.safeParse(record.gold);
  const citizensParsed = eraStartSettingsSchema.shape.citizens.safeParse(
    record.citizens,
  );
  const attackTurnsParsed = eraStartSettingsSchema.shape.attackTurns.safeParse(
    record.attackTurns,
  );

  return {
    gold: goldParsed.success
      ? goldParsed.data
      : DEFAULT_ERA_START_SETTINGS.gold,
    citizens: citizensParsed.success
      ? citizensParsed.data
      : DEFAULT_ERA_START_SETTINGS.citizens,
    attackTurns: attackTurnsParsed.success
      ? attackTurnsParsed.data
      : DEFAULT_ERA_START_SETTINGS.attackTurns,
  };
}

export type ParseStartEraBodyResult =
  | { ok: true; settings: EraStartSettings | undefined; expectedEraId?: number }
  | { ok: false; error: string };

export function parseStartEraBody(body: unknown): ParseStartEraBodyResult {
  if (body === undefined || body === null || body === '') {
    return { ok: true, settings: undefined };
  }

  let parsedBody = body;
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (trimmed === '') {
      return { ok: true, settings: undefined };
    }
    try {
      parsedBody = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: 'Invalid request body' };
    }
  }

  if (
    typeof parsedBody !== 'object' ||
    parsedBody === null ||
    Array.isArray(parsedBody)
  ) {
    return { ok: false, error: 'Request body must be an object' };
  }

  const result = startEraBodySchema.safeParse(parsedBody);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.join('.');
    const message = path
      ? `${path}: ${issue.message}`
      : issue?.message || 'Invalid start settings';
    return { ok: false, error: message };
  }

  return {
    ok: true,
    settings: result.data.startSettings,
    expectedEraId: result.data.expectedEraId,
  };
}
