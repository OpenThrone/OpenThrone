import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

import { CONFIG_ROOT_DIR } from './constants';
import type { BotActionType, BotManifest, BotSchedule } from './types';
import { BOT_ACTIONS, BOT_CLASSES, BOT_PERSONAS, BOT_RACES } from './types';

const BotManifestSpecSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(50),
  race: z.enum(BOT_RACES),
  class: z.enum(BOT_CLASSES),
  persona: z.enum(BOT_PERSONAS),
});

const BotManifestSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    bots: z.array(BotManifestSpecSchema).optional(),
    distribution: z
      .object({
        count: z.number().int().positive(),
        races: z.record(z.enum(BOT_RACES), z.number()).optional(),
        classes: z.record(z.enum(BOT_CLASSES), z.number()).optional(),
        personas: z.record(z.enum(BOT_PERSONAS), z.number()).optional(),
      })
      .optional(),
    naming: z
      .object({
        displayPrefix: z.string().optional(),
        emailDomain: z.string().optional(),
      })
      .optional(),
  })
  .refine((data) => data.bots || data.distribution, {
    message: 'Manifest must specify either bots[] or distribution',
  });

const BotScheduleSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  allocations: z
    .object({
      recruit: z.number().min(0).max(1),
      trainWorkers: z.number().min(0).max(1),
      trainOffense: z.number().min(0).max(1),
      trainDefense: z.number().min(0).max(1),
      idle: z.number().min(0).max(1),
    })
    .refine(
      (a) =>
        Math.abs(
          a.recruit +
            a.trainWorkers +
            a.trainOffense +
            a.trainDefense +
            a.idle -
            1,
        ) < 0.001,
      { message: 'Schedule allocations must sum to 1.0' },
    ),
});

function resolveConfigRoot(): string {
  return join(process.cwd(), CONFIG_ROOT_DIR);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadManifest(name = 'default'): BotManifest {
  const path = join(resolveConfigRoot(), 'manifests', `${name}.json`);
  return BotManifestSchema.parse(readJson(path)) as BotManifest;
}

export function loadSchedule(name = 'default'): BotSchedule {
  const path = join(resolveConfigRoot(), 'schedules', `${name}.json`);
  return BotScheduleSchema.parse(readJson(path)) as BotSchedule;
}

export function listAvailableManifests(): string[] {
  try {
    const dir = join(resolveConfigRoot(), 'manifests');
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

export function listAvailableSchedules(): string[] {
  try {
    const dir = join(resolveConfigRoot(), 'schedules');
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

export function validateBotActionType(value: string): value is BotActionType {
  return (BOT_ACTIONS as readonly string[]).includes(value);
}
