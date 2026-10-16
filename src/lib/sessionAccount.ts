import prisma from '@/lib/prisma';
import { canAccessGame } from '@/utils/loginPolicy';

/** Verify both identity fields because database imports can reuse account IDs. */
export async function isSessionAccountCurrent(
  value: unknown,
): Promise<boolean> {
  if (!value || typeof value !== 'object') return false;
  const account = value as { id?: unknown; email?: unknown };
  const id = typeof account.id === 'string' ? Number(account.id) : account.id;
  if (
    typeof id !== 'number' ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof account.email !== 'string' ||
    !account.email
  ) {
    return false;
  }

  const user = await prisma.users.findUnique({
    where: { id },
    select: { email: true },
  });
  return (
    user?.email?.toLowerCase() === account.email.toLowerCase() &&
    (await canAccessGame(id))
  );
}

const SESSION_BLOCKING_STATUSES = new Set([
  'BANNED',
  'SUSPENDED',
  'VACATION',
  'CLOSED',
]);

/**
 * Read-only check that the latest in-effect account status does not block
 * play. Mirrors the login policy so an existing 30-day session cannot act
 * after a ban, suspension, vacation or closure.
 */
export async function isSessionAccountStatusAllowed(
  userId: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return false;
  const now = new Date();
  const record = await prisma.accountStatusHistory.findFirst({
    where: { user_id: userId, start_date: { lte: now } },
    orderBy: [{ start_date: 'desc' }, { id: 'desc' }],
    select: { status: true, end_date: true },
  });
  if (!record) return true;
  if (record.end_date && record.end_date <= now) return true;
  return !SESSION_BLOCKING_STATUSES.has(record.status);
}
