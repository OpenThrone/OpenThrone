import { createPublicKey, verify } from 'node:crypto';

import type { NextApiRequest, NextApiResponse } from 'next';

import { discordText } from '@/services/discord/DiscordApi';
import { runDiscordCommand } from '@/services/discord/DiscordCommands.service';
import { logError } from '@/utils/logger';

export const config = { api: { bodyParser: false } };

const MAX_BYTES = 64 * 1024;
/** Ed25519 SubjectPublicKeyInfo prefix; Discord gives the raw 32-byte key. */
const ED25519_SPKI_PREFIX = '302a300506032b6570032100';
const EPHEMERAL = 64;

async function rawBody(req: NextApiRequest) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BYTES) throw new Error('Payload too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: Buffer,
) {
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex)) return false;
  if (!/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
  // Refuse replays of old signed requests.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  try {
    const key = createPublicKey({
      key: Buffer.from(ED25519_SPKI_PREFIX + publicKeyHex, 'hex'),
      format: 'der',
      type: 'spki',
    });
    return verify(
      null,
      Buffer.concat([Buffer.from(timestamp), body]),
      key,
      Buffer.from(signatureHex, 'hex'),
    );
  } catch {
    return false;
  }
}

const header = (req: NextApiRequest, name: string) => {
  const value = req.headers[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
};

/**
 * Discord interactions endpoint (slash commands). Unauthenticated by design:
 * Discord's Ed25519 signature is the authorization, and Discord rejects the
 * endpoint unless invalid signatures get a 401.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });
  let body: Buffer;
  try {
    body = await rawBody(req);
  } catch {
    return res.status(413).json({ error: 'Payload too large' });
  }
  if (
    !verifyDiscordSignature(
      publicKey,
      header(req, 'x-signature-ed25519'),
      header(req, 'x-signature-timestamp'),
      body,
    )
  )
    return res.status(401).json({ error: 'Invalid signature' });

  let interaction: {
    type?: number;
    locale?: string;
    data?: { name?: string; options?: { name: string; value: unknown }[] };
    member?: { user?: { id?: string; username?: string } };
    user?: { id?: string; username?: string };
  };
  try {
    interaction = JSON.parse(body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid body' });
  }
  if (interaction.type === 1) return res.status(200).json({ type: 1 });
  if (interaction.type !== 2)
    return res.status(400).json({ error: 'Unsupported interaction' });

  const user = interaction.member?.user ?? interaction.user;
  let content: string;
  try {
    if (!user?.id) throw new Error('Interaction without a user');
    content = await runDiscordCommand(interaction.data?.name ?? '', {
      discordUserId: user.id,
      discordUsername: (user.username ?? '').slice(0, 64),
      locale: interaction.locale,
      options: Object.fromEntries(
        (interaction.data?.options ?? []).map((option) => [
          option.name,
          String(option.value ?? ''),
        ]),
      ),
    });
  } catch {
    logError('Discord command failed', { command: interaction.data?.name });
    content = discordText(interaction.locale, 'reply.error');
  }
  return res.status(200).json({
    type: 4,
    data: {
      content: content.slice(0, 2000),
      flags: EPHEMERAL,
      allowed_mentions: { parse: [] },
    },
  });
}
