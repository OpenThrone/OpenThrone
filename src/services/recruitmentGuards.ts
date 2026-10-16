import { z } from 'zod';

import type { Prisma } from '@/lib/prisma-exports';

// A dedicated namespace keeps recruitment locks separate from other operations.
const RECRUITMENT_LOCK_NAMESPACE = 1380270930;
const SessionIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'Invalid session ID')
  .transform(Number)
  .pipe(z.number().int().positive().max(2147483647));

/** Omitted sessions are manual recruitment; supplied invalid IDs must fail. */
export function parseRecruitmentSessionId(value: string | null): number | null {
  return value === null ? null : SessionIdSchema.parse(value);
}

/** Serialize history checks and rewards for a recipient until transaction end. */
export async function lockRecruitmentRecipient(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  recipientId: number,
): Promise<void> {
  const id = z.number().int().positive().max(2147483647).parse(recipientId);
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(${RECRUITMENT_LOCK_NAMESPACE}::integer, ${id}::integer)::text
  `;
}
