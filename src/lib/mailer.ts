/**
 * Server-side mail facade.
 *
 * Both auth services send mail through `sendMail` instead of constructing a
 * nodemailer transport inline. The SMTP driver loads nodemailer through a lazy
 * dynamic import (facade pattern — never a static import), so the same build
 * runs on hosts where nodemailer cannot be bundled or started (e.g. Cloudflare
 * Workers); there the `http` or `noop` driver can be selected with MAIL_DRIVER.
 *
 * On Workers the `cloudflare` driver sends through Cloudflare Email Service's
 * `send_email` binding (MAIL_BINDING, default EMAIL) — the same service and
 * sending domain the Node hosts reach over SMTP, without nodemailer or an API
 * token secret.
 *
 * Driver selection (MAIL_DRIVER=smtp|http|cloudflare|noop, case-sensitive):
 * - explicit value wins
 * - otherwise smtp when SMTP_HOST is set, else noop (fail-safe suppression)
 *
 * Error contract: like the nodemailer call sites it replaces, `sendMail`
 * throws on failure — callers keep their existing try/catch semantics. Only
 * the noop driver never throws.
 */

import { logError, logInfo } from '@/utils/logger';

export interface SendMailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  headers?:
    | Record<string, string>
    | import('nodemailer').SendMailOptions['headers'];
}

export interface SendMailResult {
  messageId?: string;
}

export type MailDriver = 'smtp' | 'http' | 'cloudflare' | 'noop';

const MAIL_DRIVERS: readonly MailDriver[] = [
  'smtp',
  'http',
  'cloudflare',
  'noop',
];

type NodemailerModule = typeof import('nodemailer');

let nodemailerModule: NodemailerModule | null = null;
let nodemailerModulePromise: Promise<NodemailerModule | null> | null = null;

/** Resolves the configured mail driver from the environment. */
export const getMailDriver = (): MailDriver => {
  const configured = process.env.MAIL_DRIVER;
  if (MAIL_DRIVERS.includes(configured as MailDriver)) {
    return configured as MailDriver;
  }
  return process.env.SMTP_HOST ? 'smtp' : 'noop';
};

/**
 * Lazily resolves the nodemailer module once; concurrent callers share the
 * load. Returns null when the module cannot be loaded in this runtime.
 */
const loadNodemailer = (): Promise<NodemailerModule | null> => {
  if (nodemailerModule) return Promise.resolve(nodemailerModule);
  if (!nodemailerModulePromise) {
    nodemailerModulePromise = import('nodemailer')
      .then((mod) => {
        const resolved = (mod as { default?: NodemailerModule }).default ?? mod;
        nodemailerModule = resolved;
        return resolved;
      })
      .catch((error: unknown) => {
        // Drop the cached promise so a later call can retry the import.
        nodemailerModulePromise = null;
        logError('Failed to load the nodemailer module', error);
        return null;
      });
  }
  return nodemailerModulePromise;
};

/** SMTP settings preserved verbatim from the previous inline transports. */
const sendViaSmtp = async (input: SendMailInput): Promise<SendMailResult> => {
  const nodemailer = await loadNodemailer();
  if (!nodemailer) {
    throw new Error('Mail driver "smtp" is unavailable in this runtime');
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10) || 587,
    secure: process.env.SMTP_SECURE !== 'false',
    connectionTimeout: 30_000,
    socketTimeout: 60_000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: { rejectUnauthorized: true },
  });
  const info = await transporter.sendMail({
    // RFC 5322 display name + address, as Email.service always sent;
    // "<OpenThrone> addr" is refused by SMTP servers (553 5.1.3).
    from: `OpenThrone <${process.env.SMTP_FROM_EMAIL}>`,
    ...input,
  });
  return { messageId: info?.messageId };
};

/** POSTs to a Resend-compatible HTTPS API. Non-2xx responses throw. */
const sendViaHttp = async (input: SendMailInput): Promise<SendMailResult> => {
  const endpoint =
    process.env.MAIL_PROVIDER_URL || 'https://api.resend.com/emails';
  if (!endpoint.startsWith('https://')) {
    // The request carries the provider API key; never let it leave over a
    // non-TLS or file: scheme via a misconfigured URL.
    throw new Error('MAIL_PROVIDER_URL must be an https:// endpoint');
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MAIL_PROVIDER_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || process.env.SMTP_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: input.headers,
    }),
  });
  if (!response.ok) {
    const bodyExcerpt = (await response.text().catch(() => '')).slice(0, 200);
    throw new Error(
      `Mail provider request failed (${response.status}): ${bodyExcerpt}`,
    );
  }
  const data = (await response.json().catch(() => null)) as {
    id?: unknown;
  } | null;
  return { messageId: typeof data?.id === 'string' ? data.id : undefined };
};

/** Cloudflare Email Service `send_email` binding (subset this facade uses). */
interface EmailServiceBinding {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    html?: string;
    text?: string;
    headers?: Record<string, string>;
  }): Promise<{ messageId?: string }>;
}

/** Splits `Name <addr>` (or a bare address) into the binding's sender shape. */
export const parseSender = (
  value: string,
  defaultName = 'OpenThrone',
): { email: string; name?: string } => {
  const match = value.trim().match(/^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/);
  if (match) {
    const name = match[1].replace(/^"|"$/g, '').trim();
    return { email: match[2], name: name || defaultName };
  }
  return { email: value.trim(), name: defaultName };
};

/**
 * Sends through the Worker's Email Service binding. The binding rejects
 * platform-controlled headers outright, so only plain string headers pass.
 */
const sendViaCloudflare = async (
  input: SendMailInput,
): Promise<SendMailResult> => {
  const bindingName = process.env.MAIL_BINDING || 'EMAIL';
  const { getCloudflareContext } = await import('@opennextjs/cloudflare');
  const { env } = getCloudflareContext({ async: false });
  const binding = (env as Record<string, unknown>)[bindingName] as
    | EmailServiceBinding
    | undefined;
  if (!binding || typeof binding.send !== 'function') {
    throw new Error(
      `Mail driver "cloudflare" needs the ${bindingName} send_email binding`,
    );
  }
  const sender = process.env.MAIL_FROM || process.env.SMTP_FROM_EMAIL;
  if (!sender) {
    throw new Error('Mail driver "cloudflare" needs MAIL_FROM');
  }
  const headers =
    input.headers && !Array.isArray(input.headers)
      ? Object.fromEntries(
          Object.entries(input.headers).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : undefined;
  try {
    const result = await binding.send({
      to: input.to,
      from: parseSender(sender),
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
    });
    return { messageId: result?.messageId };
  } catch (error) {
    // The binding throws Errors carrying a string `code` (E_SENDER_NOT_VERIFIED,
    // E_HEADER_NOT_ALLOWED, ...); keep it in the message for the logs.
    const code = (error as { code?: unknown })?.code;
    if (typeof code === 'string' && error instanceof Error) {
      error.message = `${code}: ${error.message}`;
    }
    throw error;
  }
};

const sendNoop = async (input: SendMailInput): Promise<SendMailResult> => {
  // Never log the message body.
  logInfo('Mail suppressed by the noop driver', {
    to: input.to,
    subject: input.subject,
  });
  return {};
};

/** Sends an email through the configured driver. Throws on delivery failure. */
export const sendMail = async (
  input: SendMailInput,
): Promise<SendMailResult> => {
  const driver = getMailDriver();
  // A silent default to noop in production drops password-reset and
  // verification mail without any error — misconfiguration must fail loudly.
  // An explicit MAIL_DRIVER=noop stays honored (deliberate suppression).
  if (
    driver === 'noop' &&
    process.env.NODE_ENV === 'production' &&
    process.env.MAIL_DRIVER !== 'noop'
  ) {
    throw new Error(
      'No mail driver configured: set MAIL_DRIVER (smtp|http|cloudflare|noop) and the driver-specific envs',
    );
  }
  try {
    if (driver === 'noop') return await sendNoop(input);
    if (driver === 'http') return await sendViaHttp(input);
    if (driver === 'cloudflare') return await sendViaCloudflare(input);
    return await sendViaSmtp(input);
  } catch (error) {
    if (driver === 'smtp') {
      logError(`Failed to send mail via SMTP to ${input.to}`, error);
    } else if (driver === 'http') {
      logError(`Failed to send mail via HTTP provider to ${input.to}`, error);
    } else if (driver === 'cloudflare') {
      logError(`Failed to send mail via Cloudflare Email Service`, error);
    }
    throw error;
  }
};

/**
 * Test-only: drops the cached nodemailer module handle. Bun module mocks are
 * process-wide, so suites that mock 'nodemailer' must reset this cache to keep
 * a previously-resolved module from leaking across test files — the same
 * isolation pattern used for the realtime facade.
 */
export const __resetMailerModuleCacheForTests = (): void => {
  nodemailerModule = null;
  nodemailerModulePromise = null;
};
