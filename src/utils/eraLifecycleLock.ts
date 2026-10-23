import type { Prisma } from '@/lib/prisma-exports';

/** Serialize era lifecycle changes with edits to player login availability. */
export async function lockEraLifecycle(
  tx: Prisma.TransactionClient,
): Promise<void> {
  // PostgreSQL returns void; Prisma's pg adapter needs a supported result type.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(684731920)::text`;
}

/**
 * Transaction options for whole-player-base era operations (rollover and
 * reset). They touch every account, so they outlive Prisma's 5 s default.
 */
export const ERA_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 300_000,
  isolationLevel: 'ReadCommitted',
} as const;

/** Gameplay takes a shared lock before player/alliance locks; resets take the exclusive lock. */
export async function lockEraLifecycleShared(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(684731920)::text`;
}
