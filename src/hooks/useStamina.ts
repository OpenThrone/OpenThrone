import { useEffect, useMemo, useState } from 'react';

import type { StaminaRules } from '@/utils/stamina';
import { projectStamina } from '@/utils/stamina';

export interface StaminaBalanceInput {
  stamina: number;
  maxStamina: number;
  staminaUpdatedAt?: Date | string | null;
}

/** Read only the serialized stamina fields so UI estimates tolerate older user shapes. */
export function readStaminaBalance(value: unknown): StaminaBalanceInput | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StaminaBalanceInput>;
  if (
    typeof candidate.stamina !== 'number' ||
    typeof candidate.maxStamina !== 'number'
  ) {
    return null;
  }
  return {
    stamina: candidate.stamina,
    maxStamina: candidate.maxStamina,
    staminaUpdatedAt: candidate.staminaUpdatedAt,
  };
}

/** A local estimate for feedback only. Every action is still checked by the server. */
export function useStamina(
  balance: StaminaBalanceInput | null | undefined,
  rules: StaminaRules | null | undefined,
) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const projected = useMemo(() => {
    if (!balance || !rules) return null;
    const updatedAt = balance.staminaUpdatedAt
      ? new Date(balance.staminaUpdatedAt)
      : now;
    return projectStamina(
      {
        stamina: balance.stamina,
        maxStamina: balance.maxStamina,
        staminaUpdatedAt: Number.isNaN(updatedAt.getTime()) ? now : updatedAt,
      },
      rules,
      now,
    );
  }, [
    balance?.maxStamina,
    balance?.stamina,
    balance?.staminaUpdatedAt,
    now,
    rules,
  ]);

  return {
    now,
    projected,
  };
}
