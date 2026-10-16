import { z } from 'zod';

import prisma from '@/lib/prisma';
import type { Prisma } from '@/lib/prisma-exports';

const UserSchema = z.object({
  id: z.number().int().positive(),
});

/**
 * Checks if an attacker can attack a defender based on recent attack history (max 5 attacks in 24 hours).
 * @param attacker - The attacker user object.
 * @param defender - The defender user object.
 * @returns True if the attack is allowed, false otherwise.
 */
export const canAttack = async (
  attacker: { id: number },
  defender: { id: number },
) => {
  const validatedAttacker = UserSchema.parse(attacker);
  const validatedDefender = UserSchema.parse(defender);

  const history = await prisma.attack_log.count({
    where: {
      AND: [
        { attacker_id: validatedAttacker.id },
        { defender_id: validatedDefender.id },
        { type: 'attack' },
        {
          timestamp: {
            gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24),
          },
        }, // Last 24 hours
      ],
    },
  });
  return history < 5; // Allow if less than 5 attacks
};

/**
 * Checks if an attacker can assassinate a defender based on recent assassination history (max 5 missions in 24 hours).
 * @param attacker - The attacker user object.
 * @param defender - The defender user object.
 * @returns True if the assassination is allowed, false otherwise.
 */
const canAssassinate = async (
  attacker: { id: number },
  defender: { id: number },
) => {
  const validatedAttacker = UserSchema.parse(attacker);
  const validatedDefender = UserSchema.parse(defender);

  const history = await prisma.attack_log.count({
    where: {
      AND: [
        { attacker_id: validatedAttacker.id },
        { defender_id: validatedDefender.id },
        { type: 'ASSASSINATE' },
        {
          timestamp: {
            gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24),
          },
        },
      ],
    },
  });
  return history < 5;
};

/**
 * Checks if an attacker can infiltrate a defender based on recent infiltration history (max 5 infiltrations in 24 hours).
 * @param attacker - The attacker user object.
 * @param defender - The defender user object.
 * @returns True if the infiltration is allowed, false otherwise.
 */
const canInfiltrate = async (
  attacker: { id: number },
  defender: { id: number },
) => {
  const validatedAttacker = UserSchema.parse(attacker);
  const validatedDefender = UserSchema.parse(defender);

  const history = await prisma.attack_log.count({
    where: {
      AND: [
        { attacker_id: validatedAttacker.id },
        { defender_id: validatedDefender.id },
        { type: 'INFILTRATE' },
        {
          timestamp: {
            gte: new Date(new Date().getTime() - 1000 * 60 * 60 * 24),
          },
        },
      ],
    },
  });
  return history < 5;
};

/** Account statuses that remove a player from the battlefield entirely. */
export const UNTARGETABLE_STATUSES = new Set([
  'VACATION',
  'CLOSED',
  'BANNED',
  'SUSPENDED',
  'TIMEOUT',
  'RESET',
]);

/**
 * Whether a player may be the target of an attack or spy mission right now.
 * The target lists already hide these accounts; this is the gate the API
 * itself enforces so a direct request cannot bypass it.
 */
export const getTargetAvailability = async (
  userId: number,
  txClient?: Prisma.TransactionClient,
): Promise<{ ok: boolean; status: string | null }> => {
  const { id } = UserSchema.parse({ id: userId });
  const db = txClient ?? prisma;
  const now = new Date();
  const current = await db.accountStatusHistory.findFirst({
    where: { user_id: id, start_date: { lte: now } },
    orderBy: [{ start_date: 'desc' }, { id: 'desc' }],
    select: { status: true, end_date: true },
  });
  if (!current || (current.end_date && current.end_date <= now))
    return { ok: true, status: null };
  return {
    ok: !UNTARGETABLE_STATUSES.has(current.status),
    status: current.status,
  };
};
