import type { NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { PermissionType } from '@/lib/prisma-exports';
import type { AccountRestriction } from '@/middleware/apiGuard';
import { withApiGuard } from '@/middleware/apiGuard';
import { ModerationService } from '@/services/Moderation.service';
import type { AuthenticatedRequest } from '@/types/api';
import { hasAnyPermission } from '@/utils/authorization';
import {
  verifyLoginCaptcha,
  verifyStoredPassword,
  verifyTotpOnce,
  withLoginFailureBudget,
} from '@/utils/credentialGuards';
import { resolveClientIp } from '@/utils/ipUtils';

const CreateSchema = z
  .object({
    // Optional: the server files the appeal against the caller's in-effect
    // ban/suspension. A supplied id must match it.
    accountStatusHistoryId: z.number().int().positive().optional(),
    subject: z.string().max(200).optional(),
    body: z.string().min(10).max(5000),
    // Banned and suspended players cannot sign in, so without a session they
    // re-prove their credentials (Turnstile, password, TOTP) per request.
    email: z.string().email().optional(),
    password: z.string().min(1).max(1024).optional(),
    totpToken: z.string().max(16).optional(),
    turnstileToken: z.string().max(4096).optional(),
  })
  .refine((data) => !data.email === !data.password, {
    message: 'Email and password must be sent together',
    path: ['password'],
  });

const QuerySchema = z.object({
  scope: z.enum(['mine']).optional(),
  status: z
    .enum(['OPEN', 'IN_REVIEW', 'ACCEPTED', 'DENIED', 'WITHDRAWN'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

type CreateBody = z.infer<typeof CreateSchema>;

/** Appeal fields a player may see about their own appeals (no staff identities). */
const OWN_APPEAL_SELECT = {
  id: true,
  accountStatusHistoryId: true,
  status: true,
  subject: true,
  body: true,
  decisionSummary: true,
  createdAt: true,
  decidedAt: true,
} as const;

const PENDING_APPEAL_STATUSES = ['OPEN', 'IN_REVIEW'] as const;

const guardedHandler = withApiGuard({
  methods: ['GET', 'POST'],
  // Signed-out appellants authenticate with credentials in the handler.
  authMode: 'optional',
  allowRestrictedAccount: true,
  rateLimitProfile: 'admin',
  querySchema: QuerySchema,
  bodySchema: CreateSchema,
});

/** The in-effect ban or suspension a player may appeal, mirroring the login gate. */
async function findAppealableRestriction(userId: number) {
  const now = new Date();
  const record = await prisma.accountStatusHistory.findFirst({
    where: { user_id: userId, start_date: { lte: now } },
    orderBy: { start_date: 'desc' },
    select: { id: true, status: true, start_date: true, end_date: true },
  });
  if (!record || (record.end_date && record.end_date <= now)) return null;
  return record.status === 'BANNED' || record.status === 'SUSPENDED'
    ? record
    : null;
}

type AppellantResult = { userId: number } | { status: number; error: string };

/**
 * Verifies a signed-out appellant like a sign-in: Turnstile first, then the
 * password and TOTP inside the shared failure budget. Error codes are stable
 * so the login form can localize them.
 */
async function authenticateAppellant(
  body: CreateBody,
  ip: string | undefined,
): Promise<AppellantResult> {
  const { email, password, totpToken, turnstileToken } = body;
  if (!email || !password) return { status: 401, error: 'Unauthorized' };

  try {
    await verifyLoginCaptcha(turnstileToken);
  } catch {
    return { status: 400, error: 'captcha_failed' };
  }

  const checked = await withLoginFailureBudget<AppellantResult>(
    email,
    ip,
    async () => {
      const user = await prisma.users.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, password_hash: true, twoFactorSecret: true },
      });
      if (
        !user?.password_hash ||
        !(await verifyStoredPassword(user.password_hash, password))
      ) {
        return {
          failed: true,
          result: { status: 401, error: 'invalid_credentials' },
        };
      }
      if (user.twoFactorSecret) {
        if (!totpToken) {
          return {
            failed: false,
            result: { status: 401, error: 'totp_required' },
          };
        }
        if (!(await verifyTotpOnce(user.id, user.twoFactorSecret, totpToken))) {
          return {
            failed: true,
            result: { status: 401, error: 'invalid_totp' },
          };
        }
      }
      return { failed: false, result: { userId: user.id } };
    },
  );
  return checked ?? { status: 429, error: 'too_many_attempts' };
}

async function handler(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  context: {
    body?: CreateBody;
    query: z.infer<typeof QuerySchema>;
    accountRestriction?: AccountRestriction | null;
  },
) {
  const sessionUserId = Number(req.session?.user?.id) || null;

  if (req.method === 'GET') {
    if (!sessionUserId) return res.status(401).json({ error: 'Unauthorized' });

    if (context.query?.scope === 'mine') {
      const [restriction, appeals] = await Promise.all([
        findAppealableRestriction(sessionUserId),
        prisma.banAppeal.findMany({
          where: { userId: sessionUserId },
          select: OWN_APPEAL_SELECT,
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);
      return res.status(200).json({
        restriction: restriction
          ? {
              id: restriction.id,
              status: restriction.status,
              startDate: restriction.start_date,
              endDate: restriction.end_date,
            }
          : null,
        appeals,
      });
    }

    // Listing every appeal exposes reasons and staff names: reviewers only.
    // A restricted account never reviews, even if it holds the permission.
    const restricted =
      !!context.accountRestriction ||
      !!(await findAppealableRestriction(sessionUserId));
    const canReview =
      !restricted &&
      (await hasAnyPermission(sessionUserId, [
        PermissionType.MANAGE_BAN_APPEALS,
      ]));
    if (!canReview) return res.status(403).json({ error: 'Forbidden' });
    const result = await ModerationService.listBanAppeals({
      status: context.query.status,
      limit: context.query.limit ?? 200,
      offset: context.query.offset ?? 0,
    });
    return res.status(200).json(result);
  }

  if (req.method === 'POST') {
    const { body } = context;
    if (!body) return res.status(422).json({ error: 'Invalid request body' });
    let userId = sessionUserId;
    if (!userId) {
      const appellant = await authenticateAppellant(body, resolveClientIp(req));
      if ('error' in appellant) {
        return res.status(appellant.status).json({ error: appellant.error });
      }
      userId = appellant.userId;
    }

    // Appeals attach only to the caller's own in-effect ban or suspension.
    const restriction = await findAppealableRestriction(userId);
    if (!restriction) {
      return res.status(409).json({ error: 'no_active_restriction' });
    }
    if (
      body.accountStatusHistoryId &&
      body.accountStatusHistoryId !== restriction.id
    ) {
      return res.status(422).json({ error: 'invalid_restriction' });
    }

    const pending = await prisma.banAppeal.findFirst({
      where: {
        userId,
        accountStatusHistoryId: restriction.id,
        status: { in: [...PENDING_APPEAL_STATUSES] },
      },
      select: OWN_APPEAL_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    if (pending) {
      return res.status(409).json({ error: 'appeal_exists', appeal: pending });
    }

    const appeal = await ModerationService.createBanAppeal(userId, {
      accountStatusHistoryId: restriction.id,
      subject: body.subject,
      body: body.body,
    });
    return res.status(201).json(appeal);
  }

  return res.status(405).json({ message: 'Method not allowed' });
}

export default guardedHandler(handler);
