import { z } from 'zod';

import prisma from '@/lib/prisma';
import { GameEventStatus, GameEventType } from '@/lib/prisma-exports';
import { invalidateGameEventModifiers } from '@/services/GameEventRuntime.service';

const ModifierSchema = z.number().finite().min(0.1).max(10);
export const EventConfigSchema = z
  .object({
    goldMultiplier: ModifierSchema.optional(),
    xpMultiplier: ModifierSchema.optional(),
  })
  .strict();

const EventFieldsObjectSchema = z.object({
  key: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  type: z.nativeEnum(GameEventType),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  config: EventConfigSchema.default({}),
});

const EventFieldsSchema = EventFieldsObjectSchema.superRefine((event, ctx) => {
  if (event.endsAt <= event.startsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'End time must be after start time',
    });
  }
  if (
    event.type === GameEventType.GOLD_MODIFIER &&
    event.config.xpMultiplier !== undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['config', 'xpMultiplier'],
      message: 'Gold events cannot set an XP modifier',
    });
  }
  if (
    event.type === GameEventType.GOLD_MODIFIER &&
    event.config.goldMultiplier === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['config', 'goldMultiplier'],
      message: 'Gold multiplier is required',
    });
  }
  if (
    event.type === GameEventType.CUSTOM &&
    event.config.goldMultiplier !== undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['config', 'goldMultiplier'],
      message: 'XP events cannot set a gold modifier',
    });
  }
  if (
    event.type === GameEventType.CUSTOM &&
    event.config.xpMultiplier === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['config', 'xpMultiplier'],
      message: 'XP multiplier is required',
    });
  }
  if (
    event.type !== GameEventType.GOLD_MODIFIER &&
    event.type !== GameEventType.CUSTOM &&
    Object.keys(event.config).length
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['config'],
      message: 'This event type does not support gold or XP modifiers',
    });
  }
});

export const CreateEventSchema = EventFieldsSchema.superRefine((event, ctx) => {
  if (
    event.type !== GameEventType.GOLD_MODIFIER &&
    event.type !== GameEventType.CUSTOM
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['type'],
      message: 'Only gold and XP modifier events can be created',
    });
  }
});
export const UpdateEventSchema = EventFieldsObjectSchema.partial();

/** Encapsulates game event data access and domain operations. */
export class GameEventService {
  static async list(filters?: { status?: GameEventStatus }) {
    return prisma.gameEvent.findMany({
      where: filters?.status ? { status: filters.status } : undefined,
      include: {
        createdBy: { select: { id: true, display_name: true } },
        updatedBy: { select: { id: true, display_name: true } },
      },
      orderBy: { startsAt: 'desc' },
      take: 200,
    });
  }

  static async create(userId: number, data: unknown) {
    const validated = CreateEventSchema.parse(data);
    const event = await prisma.gameEvent.create({
      data: { ...validated, status: 'DRAFT', createdByUserId: userId },
    });
    invalidateGameEventModifiers();
    return event;
  }

  static async update(userId: number, id: number, data: unknown) {
    const changes = UpdateEventSchema.parse(data);
    const existing = await prisma.gameEvent.findUnique({ where: { id } });
    if (!existing) throw new Error('Event not found');
    const validated = EventFieldsSchema.parse({
      ...existing,
      ...changes,
      config: {
        ...(existing.config as Record<string, unknown>),
        ...(changes.config ?? {}),
      },
    });
    const event = await prisma.gameEvent.update({
      where: { id },
      data: { ...validated, updatedByUserId: userId },
    });
    invalidateGameEventModifiers();
    return event;
  }

  static async activate(userId: number, id: number) {
    const existing = await prisma.gameEvent.findUnique({ where: { id } });
    if (!existing) throw new Error('Event not found');
    if (
      existing.type !== GameEventType.GOLD_MODIFIER &&
      existing.type !== GameEventType.CUSTOM
    ) {
      throw new Error('This event type is not supported for activation');
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
