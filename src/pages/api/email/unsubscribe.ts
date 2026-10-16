import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { rateLimiter } from '@/lib/rate-limiter';
import { resolveClientIp } from '@/utils/ipUtils';
import { logError } from '@/utils/logger';
import { verifyUnsubscribeToken } from '@/utils/unsubscribeToken';

const Query = z.object({ token: z.string().min(1).max(2048) });
// withApiGuard's authMode:none still checks session sanctions and maintenance.
// A token-authenticated RFC 8058 request must work without cookies, CSRF, or game access.
export default async function unsubscribe(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const query = Query.safeParse(req.query);
    const payload = query.success
      ? verifyUnsubscribeToken(query.data.token)
      : null;
    if (!payload || !query.success) {
      const allowed = await rateLimiter(
        `email-unsubscribe:${resolveClientIp(req) ?? 'unknown'}`,
        { windowMs: 60_000, max: 12 },
      );
      if (!allowed) return res.status(429).json({ error: 'Too many requests' });
      return res.status(400).json({ error: 'Invalid unsubscribe token' });
    }
    if (req.method === 'GET')
      return res.redirect(
        303,
        `/email/unsubscribe?token=${encodeURIComponent(query.data.token)}`,
      );
    if (
      payload.category === 'TRANSACTIONAL' ||
      payload.category === 'ACCOUNT_LIFECYCLE'
    )
      return res
        .status(400)
        .json({ error: 'Essential email cannot be disabled' });
    const user = await prisma.users.findUnique({
      where: { id: payload.userId },
      select: { id: true },
    });
    if (!user)
      return res.status(400).json({ error: 'Invalid unsubscribe token' });
    const data =
      payload.category === 'ALL'
        ? { unsubscribedAllAt: new Date() }
        : payload.category === 'NEWS'
          ? { newsEmails: false }
          : payload.category === 'ATTACK_NOTIFICATION'
            ? { attackNotificationEmails: false }
            : { announcementEmails: false };
    await prisma.emailPreference.upsert({
      where: { userId: payload.userId },
      create: { userId: payload.userId, ...data },
      update: data,
    });
    return res.status(200).json({ success: true });
  } catch {
    logError('Email unsubscribe failed');
    return res
      .status(500)
      .json({ error: 'Unable to update email preferences' });
  }
}
