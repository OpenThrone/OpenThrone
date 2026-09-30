import prisma from '@/lib/prisma';
import { AuthService } from '@/services/Auth.service';
import { logError } from '@/utils/logger';

import { loadManifest } from './config';
import {
  DEFAULT_CLASS_DISTRIBUTION,
  DEFAULT_DISPLAY_PREFIX,
  DEFAULT_EMAIL_DOMAIN,
  DEFAULT_PERSONA_DISTRIBUTION,
  DEFAULT_RACE_DISTRIBUTION,
} from './constants';
import type {
  BotClass,
  BotManifest,
  BotManifestDistribution,
  BotManifestNaming,
  BotManifestSpec,
  BotPersona,
  BotRace,
} from './types';

export interface ProvisionOptions {
  dryRun?: boolean;
}

export interface ProvisionResult {
  manifestName: string;
  dryRun: boolean;
  planned: BotManifestSpec[];
  created: Array<{
    id: number;
    email: string;
    displayName: string;
    persona: BotPersona;
  }>;
  skipped: Array<{ email: string; reason: string }>;
  failed: Array<{ email: string; reason: string }>;
}

const SAMPLE_SIZE = 10_000;

function normalizeWeights(
  weights: Partial<Record<string, number>> | undefined,
  fallback: Record<string, number>,
): Array<[string, number]> {
  const source = weights ?? fallback;
  const entries = Object.entries(source).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return Object.entries(fallback);
  return entries.map(([k, w]) => [k, w / total]) as Array<[string, number]>;
}

function pickFromWeights<T extends string>(
  rng: () => number,
  weights: Array<[T, number]>,
): T {
  const r = rng();
  let cumulative = 0;
  for (const [value, weight] of weights) {
    cumulative += weight;
    if (r <= cumulative) return value;
  }
  return weights[weights.length - 1][0];
}

function createRng(seed: number): () => number {
  let state = seed % 2_147_483_647;
  if (state <= 0) state += 2_147_483_646;
  return () => {
    state = (state * 16807) % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
}

function expandDistribution(manifest: BotManifest): BotManifestSpec[] {
  const dist: BotManifestDistribution = manifest.distribution ?? {
    count: 0,
  };
  const naming: BotManifestNaming = manifest.naming ?? {};
  const displayPrefix = naming.displayPrefix ?? DEFAULT_DISPLAY_PREFIX;
  const emailDomain = naming.emailDomain ?? DEFAULT_EMAIL_DOMAIN;

  const { count } = dist;
  const races = normalizeWeights(
    dist.races as Partial<Record<string, number>>,
    DEFAULT_RACE_DISTRIBUTION,
  ) as Array<[BotRace, number]>;
  const classes = normalizeWeights(
    dist.classes as Partial<Record<string, number>>,
    DEFAULT_CLASS_DISTRIBUTION,
  ) as Array<[BotClass, number]>;
  const personas = normalizeWeights(
    dist.personas as Partial<Record<string, number>>,
    DEFAULT_PERSONA_DISTRIBUTION,
  ) as Array<[BotPersona, number]>;

  const seed = Math.floor(Math.random() * SAMPLE_SIZE) + 1;
  const rng = createRng(seed);

  const usedDisplayNames = new Set<string>();
  const specs: BotManifestSpec[] = [];

  for (let i = 0; i < count; i++) {
    const race = pickFromWeights(rng, races);
    const klass = pickFromWeights(rng, classes);
    const persona = pickFromWeights(rng, personas);

    let suffix = i + 1;
    let displayName = `${displayPrefix}${suffix}`;
    while (usedDisplayNames.has(displayName)) {
      suffix += 1;
      displayName = `${displayPrefix}${suffix}`;
    }
    usedDisplayNames.add(displayName);

    const email = `${displayPrefix.toLowerCase()}${suffix}@${emailDomain}`;

    specs.push({
      email,
      displayName,
      race,
      class: klass,
      persona,
    });
  }

  return specs;
}

function requirePassword(): string {
  const password = process.env.BOT_DEFAULT_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      'BOT_DEFAULT_PASSWORD env var must be set (minimum 8 characters) to provision bots.',
    );
  }
  return password;
}

async function isEmailOrNameTaken(
  email: string,
  displayName: string,
): Promise<{ taken: boolean; isBot: boolean }> {
  const existing = await prisma.users.findFirst({
    where: { OR: [{ email }, { display_name: displayName }] },
    select: { id: true, isBot: true },
  });
  return {
    taken: !!existing,
    isBot: !!existing?.isBot,
  };
}

async function provisionSingleSpec(
  spec: BotManifestSpec,
  password: string,
): Promise<
  | { id: number; email: string; displayName: string; persona: BotPersona }
  | { skipped: true; reason: string; email: string }
  | { failed: true; reason: string; email: string }
> {
  try {
    const { taken, isBot } = await isEmailOrNameTaken(
      spec.email,
      spec.displayName,
    );
    if (taken) {
      if (!isBot) {
        return {
          failed: true,
          email: spec.email,
          reason: `User ${spec.email} / ${spec.displayName} already exists and is not a bot`,
        };
      }
      return {
        skipped: true,
        email: spec.email,
        reason: 'Bot already provisioned',
      };
    }

    const user = await AuthService.registerUser({
      email: spec.email,
      password,
      display_name: spec.displayName,
      race: spec.race,
      class: spec.class,
    });

    const updated = await prisma.users.update({
      where: { id: user.id },
      data: {
        isBot: true,
        botPersona: spec.persona,
        botConfig: {},
        botCreatedAt: new Date(),
        botStats: { history: [] },
        last_active: new Date(),
      },
      select: { id: true },
    });

    await prisma.accountStatusHistory.create({
      data: {
        user_id: updated.id,
        status: 'ACTIVE',
        start_date: new Date(),
        reason: 'Bot account initialization',
      },
    });

    return {
      id: updated.id,
      email: spec.email,
      displayName: spec.displayName,
      persona: spec.persona,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { failed: true, email: spec.email, reason: message };
  }
}

export class BotFactory {
  static planFromManifest(manifestName = 'default'): BotManifestSpec[] {
    const manifest = loadManifest(manifestName);
    if (manifest.bots && manifest.bots.length > 0) {
      return manifest.bots;
    }
    return expandDistribution(manifest);
  }

  static async provisionFromManifest(
    manifestName = 'default',
    options: ProvisionOptions = {},
  ): Promise<ProvisionResult> {
    const planned = this.planFromManifest(manifestName);

    if (options.dryRun) {
      return {
        manifestName,
        dryRun: true,
        planned,
        created: [],
        skipped: [],
        failed: [],
      };
    }

    const password = requirePassword();
    const created: ProvisionResult['created'] = [];
    const skipped: ProvisionResult['skipped'] = [];
    const failed: ProvisionResult['failed'] = [];

    for (const spec of planned) {
      const result = await provisionSingleSpec(spec, password);
      if ('skipped' in result) {
        skipped.push({ email: result.email, reason: result.reason });
        continue;
      }
      if ('failed' in result) {
        failed.push({ email: result.email, reason: result.reason });
        if (
          result.reason.includes('anti-abuse') ||
          result.reason.includes('temporarily restricted')
        ) {
          logError(
            `Bot provisioning blocked by anti-abuse for ${result.email}`,
          );
        }
        continue;
      }
      created.push({
        id: result.id,
        email: result.email,
        displayName: result.displayName,
        persona: result.persona,
      });
    }

    return { manifestName, dryRun: false, planned, created, skipped, failed };
  }
}
