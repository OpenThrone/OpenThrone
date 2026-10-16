import type { Prisma } from '@/lib/prisma-exports';
import { enqueueEmails } from '@/services/Email.service';
import { renderEmail } from '@/services/emailTemplates';

interface BattleAlert {
  defenderId: number;
  attackerName: string;
  attackLogId: number;
  defenderWon: boolean;
}

/** Call inside the combat transaction; never sends SMTP in the request. */
export async function enqueueBattleAlert(
  tx: Prisma.TransactionClient,
  alert: BattleAlert,
) {
  const preference = await tx.emailPreference.findUnique({
    where: { userId: alert.defenderId },
  });
  if (!preference?.attackNotificationEmails || preference.unsubscribedAllAt)
    return;
  const user = await tx.users.findUnique({
    where: { id: alert.defenderId },
    select: { email: true, display_name: true, locale: true },
  });
  if (
    !user ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) ||
    user.email.toLowerCase().endsWith('@deleted.local')
  )
    return;
  const rendered = renderEmail({
    kind: 'ATTACK_NOTIFICATION',
    locale: user.locale,
    vars: {
      userId: alert.defenderId,
      display_name: user.display_name,
      attackerName: alert.attackerName,
      attackLogId: alert.attackLogId,
      defenderWon: alert.defenderWon,
    },
  });
  await enqueueEmails(tx, [
    {
      eventKey: `battle-alert:${alert.attackLogId}:${alert.defenderId}`,
      userId: alert.defenderId,
      toAddress: user.email,
      category: 'ATTACK_NOTIFICATION',
      locale: user.locale,
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
    },
  ]);
}
