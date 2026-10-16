import prisma from '@/lib/prisma';
import type { EmailCampaignKind, Prisma } from '@/lib/prisma-exports';
import type {
  EmailQueueItem,
  EmailRecipient,
  RecipientFilter,
} from '@/services/Email.service';
import {
  enqueueEmails,
  forEachEligibleRecipientBatch,
} from '@/services/Email.service';
import type { EmailTemplateVars } from '@/services/emailTemplates';
import { renderEmail } from '@/services/emailTemplates';

type CampaignInput = {
  kind: EmailCampaignKind;
  subject: string;
  body: string;
  audience: Prisma.InputJsonValue;
  createdByUserId?: number;
  blogPostId?: number;
  recipients?: EmailRecipient[];
  recipientFilter?: RecipientFilter;
  vars?: Omit<EmailTemplateVars, 'userId'>;
  recipientVars?: (recipient: EmailRecipient) => Partial<EmailTemplateVars>;
};
function campaignItems(
  campaignId: number,
  input: CampaignInput,
  recipients: EmailRecipient[],
): EmailQueueItem[] {
  return recipients.map((recipient) => {
    const rendered = renderEmail({
      kind: input.kind,
      locale: recipient.locale,
      vars: {
        subject: input.subject,
        body: input.body,
        ...input.vars,
        ...input.recipientVars?.(recipient),
        userId: recipient.userId,
        display_name: recipient.display_name,
      },
    });
    return {
      campaignId,
      userId: recipient.userId,
      toAddress: recipient.email,
      locale: recipient.locale,
      category:
        input.kind === 'NEWS'
          ? 'NEWS'
          : input.kind === 'BROADCAST'
            ? 'ANNOUNCEMENT'
            : 'ACCOUNT_LIFECYCLE',
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
    };
  });
}

/** Append a bounded snapshot page without releasing the draft. */
export async function enqueueCampaignBatch(
  tx: Prisma.TransactionClient,
  campaignId: number,
  input: CampaignInput,
) {
  return enqueueEmails(
    tx,
    campaignItems(campaignId, input, input.recipients ?? []),
  );
}

/** Separate page transactions keep the campaign invisible to delivery until complete. */
export async function enqueueDraftCampaign(
  campaignId: number,
  input: CampaignInput,
) {
  if (!input.recipientFilter) throw new Error('Recipient filter is required');
  let count = 0;
  await forEachEligibleRecipientBatch(
    input.recipientFilter,
    250,
    async (recipients) => {
      const inserted = await prisma.$transaction(async (tx) =>
        enqueueEmails(tx, campaignItems(campaignId, input, recipients)),
      );
      count += inserted.count;
    },
  );
  return prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: 'QUEUED', recipientCount: count },
  });
}

async function enqueueCampaignSnapshots(
  tx: Prisma.TransactionClient,
  campaignId: number,
  input: CampaignInput,
) {
  let count = 0;
  for (
    let offset = 0;
    offset < (input.recipients ?? []).length;
    offset += 250
  ) {
    const inserted = await enqueueEmails(
      tx,
      campaignItems(
        campaignId,
        input,
        (input.recipients ?? []).slice(offset, offset + 250),
      ),
    );
    count += inserted.count;
  }
  return tx.emailCampaign.update({
    where: { id: campaignId },
    data: { status: 'QUEUED', recipientCount: count },
  });
}
/** Reserve a DRAFT together with the initiating action and audit before enqueueing pages. */
export async function createDraftCampaign(
  tx: Prisma.TransactionClient,
  input: CampaignInput,
) {
  const {
    recipients: _recipients,
    recipientFilter: _recipientFilter,
    vars: _vars,
    recipientVars: _recipientVars,
    ...data
  } = input;
  return tx.emailCampaign.create({ data: { ...data, status: 'DRAFT' } });
}

/** Queue every snapshot before releasing the campaign to the worker. */
export async function createQueuedCampaign(
  tx: Prisma.TransactionClient | typeof prisma,
  input: CampaignInput,
) {
  if (input.recipientFilter && tx !== prisma)
    throw new Error(
      'Paged campaigns must be enqueued after the draft transaction commits',
    );
  const campaign = await createDraftCampaign(tx, input);
  return input.recipientFilter
    ? enqueueDraftCampaign(campaign.id, input)
    : enqueueCampaignSnapshots(tx, campaign.id, input);
}
/** Serialize publishers; ON CONFLICT treats the unique campaign key as already sent without aborting the transaction. */
export async function queueNewsEmail(
  tx: Prisma.TransactionClient,
  post: { id: number; title: string; excerpt: string | null; content: string },
  actorId: number,
  recipients?: EmailRecipient[],
) {
  await tx.$queryRaw`SELECT id FROM blog_posts WHERE id = ${post.id} FOR UPDATE`;
  const where = {
    kind_blogPostId: { kind: 'NEWS' as const, blogPostId: post.id },
  };
  const existing = await tx.emailCampaign.findUnique({ where });
  if (existing) return { alreadySent: true, campaign: existing };
  const data = {
    kind: 'NEWS' as const,
    subject: post.title,
    body: post.excerpt ?? '',
    audience: { includeAll: true },
    blogPostId: post.id,
    createdByUserId: actorId,
  };
  const inserted = await tx.emailCampaign.createMany({
    data: [data],
    skipDuplicates: true,
  });
  const campaign = await tx.emailCampaign.findUnique({ where });
  if (!campaign) throw new Error('News campaign could not be created');
  if (!inserted.count) return { alreadySent: true, campaign };
  return {
    alreadySent: false,
    campaign:
      recipients === undefined
        ? campaign
        : await enqueueCampaignSnapshots(tx, campaign.id, {
            ...data,
            recipients,
            vars: {
              title: post.title,
              excerpt: post.excerpt ?? '',
              id: post.id,
            },
          }),
  };
}

/** Complete a committed NEWS draft without keeping the publishing transaction open. */
export async function releaseNewsEmail(
  result: Awaited<ReturnType<typeof queueNewsEmail>>,
  post: { id: number; title: string; excerpt: string | null },
) {
  if (result.alreadySent) return result;
  return {
    alreadySent: false,
    campaign: await enqueueDraftCampaign(result.campaign.id, {
      kind: 'NEWS',
      subject: post.title,
      body: post.excerpt ?? '',
      audience: { includeAll: true },
      recipientFilter: { category: 'NEWS', includeAll: true },
      vars: { title: post.title, excerpt: post.excerpt ?? '', id: post.id },
    }),
  };
}
