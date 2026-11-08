/**
 * One-time: deletes avatar files left behind by accounts deleted before
 * account deletion removed them. Idempotent. Prints counts only.
 *
 *   POSTGRES_PRISMA_URL=... [AWS_* settings as the app uses] \
 *     bun --no-env-file scripts/purge-deleted-avatars.ts [--dry-run]
 */
import prisma from '@/lib/prisma';
import { deleteUserAvatarFiles } from '@/services/PrivacyRetention.service';

const dryRun = process.argv.includes('--dry-run');
try {
  const users = await prisma.users.findMany({
    where: { email: { endsWith: '@deleted.local' } },
    select: { id: true },
  });
  let failed = 0;
  if (!dryRun)
    for (const { id } of users)
      if (!(await deleteUserAvatarFiles(id))) failed++;
  console.log(
    JSON.stringify({ dryRun, deletedAccounts: users.length, failed }),
  );
} finally {
  await prisma.$disconnect();
}
