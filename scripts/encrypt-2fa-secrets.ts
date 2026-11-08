/**
 * Encrypts authenticator secrets stored before encryption. With --rekey it
 * also rewrites rows encrypted under an older key (for example after setting
 * TWO_FACTOR_ENCRYPTION_KEY or rotating NEXTAUTH_SECRET; keep the old secret
 * configured as a fallback until this has run). Idempotent. Prints counts only.
 *
 *   POSTGRES_PRISMA_URL=... NEXTAUTH_SECRET=... [TWO_FACTOR_ENCRYPTION_KEY=...] \
 *     bun --no-env-file scripts/encrypt-2fa-secrets.ts [--rekey] [--dry-run]
 */
import prisma from '@/lib/prisma';
import {
  decryptTwoFactorSecret,
  encryptTwoFactorSecret,
  isEncryptedTwoFactorSecret,
  needsReencryption,
} from '@/utils/twoFactorSecret';

const dryRun = process.argv.includes('--dry-run');
const rekey = process.argv.includes('--rekey');
try {
  const rows = await prisma.users.findMany({
    where: { twoFactorSecret: { not: null } },
    select: { id: true, twoFactorSecret: true },
  });
  // An empty value is not an enrolment; encrypting it would switch 2FA on.
  const candidates = rows.filter(
    (row): row is { id: number; twoFactorSecret: string } =>
      !!row.twoFactorSecret?.trim() &&
      (rekey
        ? needsReencryption(row.twoFactorSecret)
        : !isEncryptedTwoFactorSecret(row.twoFactorSecret)),
  );
  let updated = 0;
  let unreadable = 0;
  if (!dryRun)
    for (const row of candidates) {
      const plain = decryptTwoFactorSecret(row.twoFactorSecret);
      if (!plain) {
        unreadable++;
        continue;
      }
      // Only replace the exact value read, so a concurrent change is kept.
      const result = await prisma.users.updateMany({
        where: { id: row.id, twoFactorSecret: row.twoFactorSecret },
        data: { twoFactorSecret: encryptTwoFactorSecret(plain) },
      });
      updated += result.count;
    }
  console.log(
    JSON.stringify({
      dryRun,
      rekey,
      enrolled: rows.length,
      candidates: candidates.length,
      updated,
      unreadable,
    }),
  );
} finally {
  await prisma.$disconnect();
}
