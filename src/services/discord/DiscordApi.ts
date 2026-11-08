import de from '../../../public/locales/de/discord.json';
import en from '../../../public/locales/en/discord.json';
import es from '../../../public/locales/es/discord.json';

/**
 * Minimal Discord REST client for bot DMs. The bot uses HTTP interactions
 * only, so no gateway connection runs. The token never appears in errors.
 */
const API = 'https://discord.com/api/v10';

export class DiscordApiError extends Error {
  constructor(
    readonly status: number,
    /** Discord's JSON error code, e.g. 50007 = cannot DM this user. */
    readonly code: number | null,
    readonly retryAfterMs: number | null,
  ) {
    super(`Discord API error ${status}${code ? ` (${code})` : ''}`);
  }
}

export const discordBotConfigured = () => !!process.env.DISCORD_BOT_TOKEN;

async function call<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(API + path, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as {
    code?: number;
    retry_after?: number;
  };
  if (!response.ok)
    throw new DiscordApiError(
      response.status,
      typeof data.code === 'number' ? data.code : null,
      typeof data.retry_after === 'number'
        ? Math.ceil(data.retry_after * 1000)
        : null,
    );
  return data as T;
}

/** Opens (or reuses) the DM channel and posts plain text with no mentions. */
export async function sendDirectMessage(
  discordUserId: string,
  content: string,
) {
  const channel = await call<{ id: string }>('/users/@me/channels', {
    recipient_id: discordUserId,
  });
  await call(`/channels/${channel.id}/messages`, {
    content: content.slice(0, 2000),
    allowed_mentions: { parse: [] },
  });
}

const dictionaries = { en, es, de } as const;
type Dict = Record<string, unknown>;

export const discordLocale = (locale: string | null | undefined) => {
  const base = (locale ?? 'en').slice(0, 2).toLowerCase();
  return base in dictionaries ? (base as keyof typeof dictionaries) : 'en';
};

/** Looks up `alert.attacks`-style keys and fills {{vars}}. */
export function discordText(
  locale: string | null | undefined,
  key: string,
  vars: Record<string, string | number> = {},
) {
  const find = (dict: Dict) =>
    key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Dict | undefined)?.[part],
        dict,
      );
  const template =
    find(dictionaries[discordLocale(locale)] as Dict) ?? find(en as Dict);
  return String(template ?? key).replace(/{{(\w+)}}/g, (_, name: string) =>
    String(vars[name] ?? ''),
  );
}

export const siteUrl = (path: string) =>
  new URL(
    path,
    process.env.NEXTAUTH_URL ?? 'https://openthrone.dev',
  ).toString();
