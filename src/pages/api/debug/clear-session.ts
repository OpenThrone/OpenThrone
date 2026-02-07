import type { NextApiRequest, NextApiResponse } from 'next';

import { withApiGuard } from '@/middleware/apiGuard';

const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.csrf-token',
  '__Host-next-auth.csrf-token',
] as const;

const expireCookie = (name: string) =>
  `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax`;

const guardedHandler = withApiGuard({
  methods: ['POST'],
  authMode: 'none',
});

function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ status: 'failed', message: 'Not found' });
  }

  res.setHeader(
    'Set-Cookie',
    SESSION_COOKIE_NAMES.map((cookieName) => expireCookie(cookieName)),
  );

  return res.status(200).json({ status: 'success' });
}

export default guardedHandler(handler);
