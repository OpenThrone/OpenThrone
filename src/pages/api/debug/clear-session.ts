import type { NextApiRequest, NextApiResponse } from 'next';

const SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.csrf-token',
  '__Host-next-auth.csrf-token',
] as const;

const expireCookie = (name: string) =>
  `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax`;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'failed', message: 'Method not allowed' });
  }

  res.setHeader(
    'Set-Cookie',
    SESSION_COOKIE_NAMES.map((cookieName) => expireCookie(cookieName)),
  );

  return res.status(200).json({ status: 'success' });
}
