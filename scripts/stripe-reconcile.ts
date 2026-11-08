/**
 * Applies Stripe payments, renewals, refunds, disputes and subscription
 * changes that the webhook missed. Idempotent.
 *
 *   STRIPE_SECRET_KEY=... POSTGRES_PRISMA_URL=... \
 *     bun --no-env-file scripts/stripe-reconcile.ts [--days 35] [--dry-run]
 *
 * Prints a sanitized report (counts and internal event ids only).
 */
import prisma from '@/lib/prisma';
import { reconcileStripe } from '@/services/supporter/StripeReconcile.service';

const args = process.argv.slice(2);
const daysArg = args.indexOf('--days');
const days = daysArg >= 0 ? Number(args[daysArg + 1]) : 35;
if (!Number.isSafeInteger(days) || days < 1 || days > 400)
  throw new Error('--days must be between 1 and 400');

try {
  const report = await reconcileStripe({
    days,
    dryRun: args.includes('--dry-run'),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.failed.length) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
