import { z } from 'zod';

import {
  GameEventEffectsSchema,
  hasPrimaryEffect,
} from '@/constants/gameEvents';
import prisma from '@/lib/prisma';
import { GameEventStatus, GameEventType } from '@/lib/prisma-exports';
import { ensureActiveEra } from '@/services/Era.service';
import { invalidateGameEventModifiers } from '@/services/GameEventRuntime.service';

const SUPPORTED_TYPES: GameEventType[] = [
  GameEventType.CUSTOM,
  GameEventType.GOLD_MODIFIER,
];

export { GameEventEffectsSchema as EventConfigSchema };

const EventFieldsObjectSchema = z.object({
  key: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  type: z.nativeEnum(GameEventType).default(GameEventType.CUSTOM),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  /** Bind the event to the current era instead of an end time. */
  untilEraEnd: z.boolean().optional(),
  config: GameEventEffectsSchema.default({}),
});

type EventFields = z.infer<typeof EventFieldsObjectSchema>;

const refineEventFields = (event: EventFields, ctx: z.RefinementCtx) => {
  if (!SUPPORTED_TYPES.includes(event.type)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['type'],
      message: 'Only bonus events can be created',
    });
  }
  if (!event.untilEraEnd) {
    if (!event.endsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'Set an end time or run the event until the era ends',
      });
    } else if (event.endsAt <= event.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'End time must be after start time',
      });
    }
  }
  if (!hasPrimaryEffect(event.config)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['config'],
      message: 'Choose at least one effect',
    });
  }
};

const EventFieldsSchema =
  EventFieldsObjectSchema.superRefine(refineEventFields);

export const CreateEventSchema = EventFieldsSchema;
export const UpdateEventSchema = EventFieldsObjectSchema.partial();

/** Maps validated fields to columns: era-bound events have no end time. */
const toEventColumns = async (event: EventFields) => {
  const { untilEraEnd, ...rest } = event;
  if (!untilEraEnd)
    return { ...rest, endsAt: rest.endsAt ?? null, eraId: null };
  const era = await ensureActiveEra();
  return { ...rest, endsAt: null, eraId: era.id };
};

/** Encapsulates game event data access and domain operations. */
export class GameEventService {
  static async list(filters?: { status?: GameEventStatus }) {
    return prisma.gameEvent.findMany({
      where: filters?.status ? { status: filters.status } : undefined,
      include: {
        createdBy: { select: { id: true, display_name: true } },
        updatedBy: { select: { id: true, display_name: true } },
        era: { select: { id: true, name: true, endDate: true } },
      },
      orderBy: { startsAt: 'desc' },
      take: 200,
    });
  }

  static async create(userId: number, data: unknown) {
    const validated = CreateEventSchema.parse(data);
    const event = await prisma.gameEvent.create({
      data: {
        ...(await toEventColumns(validated)),
        status: 'DRAFT',
        createdByUserId: userId,
      },
    });
    invalidateGameEventModifiers();
    return event;
  }

  static async update(userId: number, id: number, data: unknown) {
    const changes = UpdateEventSchema.parse(data);
    const existing = await prisma.gameEvent.findUnique({ where: { id } });
    if (!existing) throw new Error('Event not found');
    // A config in the request replaces the whole effect set so effects can
    // be removed; era binding is kept unless the request changes it.
    const validated = EventFieldsSchema.parse({
      key: existing.key,
      name: existing.name,
      description: existing.description,
      type: existing.type,
      startsAt: existing.startsAt,
      endsAt: existing.endsAt,
      untilEraEnd: existing.eraId != null && existing.endsAt == null,
      config: existing.config,
      ...changes,
    });
    const columns = await toEventColumns(validated);
    const keepEra =
      validated.untilEraEnd &&
      existing.eraId != null &&
      changes.untilEraEnd === undefined;
    const event = await prisma.gameEvent.update({
      where: { id },
      data: {
        ...columns,
        ...(keepEra ? { eraId: existing.eraId } : {}),
        updatedByUserId: userId,
      },
    });
    invalidateGameEventModifiers();
    return event;
  }

  static async activate(userId: number, id: number) {
    const existing = await prisma.gameEvent.findUnique({ where: { id } });
    if (!existing) throw new Error('Event not found');
    if (!SUPPORTED_TYPES.includes(existing.type)) {
      throw new Error('This event type is not supported for activation');
    }
    if (existing.eraId != null) {
      const era = await prisma.era.findUnique({
        where: { id: existing.eraId },
        select: { endDate: true },
      });
      if (era?.endDate) {
        throw new Error('This event belonged to an era that has ended');
      }
    }
    const event = await prisma.gameEvent.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date(),
        updatedByUserId: userId,
      },
    });
    invalidateGameEventModifiers();
    return event;
  }

  static async deactivate(userId: number, id: number) {
    const event = await prisma.gameEvent.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        deactivatedAt: new Date(),
        updatedByUserId: userId,
      },
    });
    invalidateGameEventModifiers();
    return event;
  }

  static async delete(id: number) {
    const event = await prisma.gameEvent.delete({ where: { id } });
    invalidateGameEventModifiers();
    return event;
  }
}
