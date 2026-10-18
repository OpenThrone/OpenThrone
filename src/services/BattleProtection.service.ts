import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';
import type { BattleUser } from '@/models/BattleUser';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import type {
  ProtectionEraInput,
  ProtectionSettings,
} from '@/utils/battleProtection';
import { normalizeProtectionDurationDays } from '@/utils/battleProtection';

type Db = Prisma.TransactionClient | typeof prisma;

export interface ProtectionContext {
  era: ProtectionEraInput | null;
  settings: ProtectionSettings;
}

/** Loads the active era and admin settings that feed the shared protection rule. */
export async function loadProtectionContext(
  db: Db = prisma,
): Promise<ProtectionContext> {
  const [era, config] = await Promise.all([
    db.era.findFirst({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
      select: { id: true, startDate: true, startSettings: true },
    }),
    getRuntimeConfig(),
  ]);
  return {
    era,
    settings: {
      durationDays: normalizeProtectionDurationDays(
        config.protectionDurationDays,
      ),
      dailyCitizenBonus: config.dailyCitizenBonus ?? 0,
    },
  };
}

/** Attaches a loaded context to battle users so `isProtected()` uses the shared rule. */
export function applyProtectionContext(
  context: ProtectionContext,
  ...users: BattleUser[]
): void {
  for (const user of users)
    user.setProtectionContext(context.era, context.settings);
}
