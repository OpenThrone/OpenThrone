import { NextApiRequest } from "next";

export function getIpAddress(req: NextApiRequest): string {
  return (
    (req.headers['cf-connecting-ip'] as string) ||
    req.connection.remoteAddress ||
    'No IP address detected.'
  );
}