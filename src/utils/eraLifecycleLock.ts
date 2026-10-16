import type { Prisma } from '@/lib/prisma-exports';

/** Serialize era lifecycle changes with edits to player login availability. */
export async function lockEraLifecycle(
  tx: Prisma.TransactionClient,
): Promise<void> {
  // PostgreSQL returns void; Prisma's pg adapter needs a supported result type.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(684731920)::text`;
}
