import type { Prisma } from '@/lib/prisma-exports';
import { getRuntimeConfig } from '@/services/RuntimeConfig.service';
import { logError } from '@/utils/logger';
import {
  DEFAULT_STAMINA_RULES,
  projectStamina,
  type StaminaBalance,
} from '@/utils/stamina';

/** Caller holds the exclusive lifecycle lock. Settle all players under old rules. */
export async function settleStaminaSettings(tx: Prisma.TransactionClient) {
  const rules = (await getRuntimeConfig(tx)).stamina ?? DEFAULT_STAMINA_RULES;
  const now = new Date();
  // Lock rows before reading so other writers cannot overwrite settled balances.
  await tx.$queryRaw`SELECT id FROM users ORDER BY id FOR UPDATE`;
  // One statement avoids one network round trip per player during admin changes.
  // Settle whole old-rule intervals, then start the new rule's clock at now.
  await tx.$executeRaw`
    UPDATE users
    SET stamina = LEAST(GREATEST("maxStamina", 0), GREATEST(stamina, 0) +
      CASE WHEN ${rules.enabled && rules.recoveryEnabled} THEN
        FLOOR(GREATEST(0, EXTRACT(EPOCH FROM
          (${now}::timestamp - "staminaUpdatedAt"))) /
          ${rules.recoveryIntervalMinutes * 60}) * ${rules.recoveryAmount}
      ELSE 0 END)::integer,
      "staminaUpdatedAt" = ${now}
  `;
}

/** Estimates must not turn a second config read into a failed player DTO. */
export async function projectUserStamina(
  balance: StaminaBalance,
): Promise<StaminaBalance> {
  try {
    return projectStamina(
      balance,
      (await getRuntimeConfig()).stamina ?? DEFAULT_STAMINA_RULES,
    );
  } catch (error) {
    logError('Stamina estimate unavailable; retaining stored balance', error);
    // Do not invent recovery from fallback rules when the active rules are unknown.
    return {
      stamina: balance.stamina,
      maxStamina: balance.maxStamina,
      staminaUpdatedAt: balance.staminaUpdatedAt,
    };
  }
}
