import type { Prisma } from '@/lib/prisma-exports';
import { enqueueEmails } from '@/services/Email.service';
import type { EmailTemplateVars } from '@/services/emailTemplates';
import { renderEmail } from '@/services/emailTemplates';
import { logError } from '@/utils/logger';

/**
 * Queues a purchase receipt or cancellation notice inside the payment
 * transaction (sent later by the email worker). A rendering problem, such as
 * missing site URL configuration, is logged and never blocks the payment.
 */
export async function enqueueSupporterEmail(
  tx: Prisma.TransactionClient,
  kind: 'SUPPORTER_RECEIPT' | 'SUPPORTER_CANCELED',
  eventKey: string,
  userId: number,
  vars: Omit<EmailTemplateVars, 'userId' | 'display_name'>,
) {
  const user = await tx.users.findUnique({
    where: { id: userId },
    select: { email: true, display_name: true, locale: true },
  });
  if (!user?.email || user.email.toLowerCase().endsWith('@deleted.local'))
    return;
  let rendered;
  try {
    rendered = renderEmail({
      kind,
      locale: user.locale,
      vars: { ...vars, userId, display_name: user.display_name },
    });
  } catch {
    logError('Supporter email not rendered', { kind, userId });
    return;
  }
  await enqueueEmails(tx, [
    {
      eventKey,
      userId,
      toAddress: user.email,
      category: 'TRANSACTIONAL',
      locale: user.locale,
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
    },
  ]);
}
