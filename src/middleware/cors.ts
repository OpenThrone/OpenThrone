import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';

import { applyCors, getCorsAllowlist } from '@/utils/cors';

type CorsOptions = {
  allowlist?: string[];
  envVar?: string;
};

/** With cors. */
export const withCors = (
  handler: NextApiHandler,
  options: CorsOptions = {},
): NextApiHandler => {
  return (req: NextApiRequest, res: NextApiResponse) => {
    const allowlist =
      options.allowlist ??
      getCorsAllowlist(process.env[options.envVar ?? 'OT_API_CORS_ORIGINS']);

    if (applyCors(req, res, allowlist)) return;

    return handler(req, res);
  };
};
