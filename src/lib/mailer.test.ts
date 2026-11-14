import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import nodemailer from 'nodemailer';
import { silenceLogger } from 'test/utils/silenceLogger';

import * as logger from '@/utils/logger';

silenceLogger();

const { __resetMailerModuleCacheForTests, getMailDriver, sendMail } =
  await import('./mailer');

type EnvKey =
  | 'MAIL_DRIVER'
  | 'SMTP_HOST'
  | 'SMTP_FROM_EMAIL'
  | 'MAIL_FROM'
  | 'MAIL_PROVIDER_URL'
  | 'MAIL_PROVIDER_API_KEY';
const ENV_KEYS: EnvKey[] = [
  'MAIL_DRIVER',
  'SMTP_HOST',
  'SMTP_FROM_EMAIL',
  'MAIL_FROM',
  'MAIL_PROVIDER_URL',
  'MAIL_PROVIDER_API_KEY',
];
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);
const originalFetch = globalThis.fetch;

const setEnv = (key: EnvKey, value: string | undefined) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

const makeFetchResponse = (
  ok: boolean,
  body: unknown,
  status = ok ? 200 : 500,
) =>
  ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

describe('mailer facade', () => {
  let createTransportSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Drop the facade's cached nodemailer handle so every smtp test re-runs
    // the lazy dynamic import (facade pattern) against the spied module.
    __resetMailerModuleCacheForTests();
    createTransportSpy = vi.spyOn(nodemailer, 'createTransport');
    for (const key of ENV_KEYS) setEnv(key, undefined);
  });

  afterEach(() => {
    createTransportSpy.mockRestore();
    globalThis.fetch = originalFetch;
    for (const key of ENV_KEYS) {
      setEnv(key, originalEnv[key]);
    }
  });

  describe('driver selection', () => {
    it('defaults to smtp when SMTP_HOST is set and noop otherwise', () => {
      expect(getMailDriver()).toBe('noop');
      setEnv('SMTP_HOST', 'smtp.example.com');
      expect(getMailDriver()).toBe('smtp');
    });

    it('honors an explicit MAIL_DRIVER over SMTP_HOST', () => {
      setEnv('SMTP_HOST', 'smtp.example.com');
      setEnv('MAIL_DRIVER', 'noop');
      expect(getMailDriver()).toBe('noop');
      setEnv('MAIL_DRIVER', 'http');
      expect(getMailDriver()).toBe('http');
      setEnv('MAIL_DRIVER', 'smtp');
      expect(getMailDriver()).toBe('smtp');
    });

    it('falls back to defaults for unknown MAIL_DRIVER values', () => {
      setEnv('MAIL_DRIVER', 'carrier-pigeon');
      expect(getMailDriver()).toBe('noop');
      setEnv('SMTP_HOST', 'smtp.example.com');
      expect(getMailDriver()).toBe('smtp');
    });
  });

  describe('noop driver', () => {
    it('logs a suppression without touching fetch or nodemailer', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;
      const logInfoSpy = vi.spyOn(logger, 'logInfo');

      const result = await sendMail({
        to: 'player@example.invalid',
        subject: 'Synthetic subject',
        text: 'synthetic body that must never be logged',
      });

      expect(result).toEqual({});
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(createTransportSpy).not.toHaveBeenCalled();
      expect(logInfoSpy).toHaveBeenCalledTimes(1);
      const [message, details] = logInfoSpy.mock.calls[0] as [
        string,
        Record<string, string>,
      ];
      expect(message).toContain('noop');
      expect(details.to).toBe('player@example.invalid');
      expect(details.subject).toBe('Synthetic subject');
      expect(JSON.stringify(logInfoSpy.mock.calls)).not.toContain(
        'synthetic body',
      );
      logInfoSpy.mockRestore();
    });
  });

  describe('http driver', () => {
    it('posts to a Resend-compatible endpoint with bearer auth', async () => {
      process.env.MAIL_DRIVER = 'http';
      process.env.MAIL_PROVIDER_API_KEY = 'synthetic-provider-key';
      process.env.MAIL_FROM = 'OpenThrone <mail@example.invalid>';
      const fetchSpy = vi.fn(
        async () => makeFetchResponse(true, { id: 'provider-msg-1' }) as any,
      );
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      const result = await sendMail({
        to: 'player@example.invalid',
        subject: 'Password Reset',
        html: '<p>synthetic</p>',
        text: 'synthetic',
      });

      expect(result).toEqual({ messageId: 'provider-msg-1' });
      const [url, init] = fetchSpy.mock.calls[0] as [
        string,
        RequestInit & { body: string },
      ];
      expect(url).toBe('https://api.resend.com/emails');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer synthetic-provider-key',
      });
      expect(JSON.parse(init.body)).toEqual({
        from: 'OpenThrone <mail@example.invalid>',
        to: 'player@example.invalid',
        subject: 'Password Reset',
        html: '<p>synthetic</p>',
        text: 'synthetic',
      });
    });

    it('honors a MAIL_PROVIDER_URL override and falls back to SMTP_FROM_EMAIL', async () => {
      process.env.MAIL_DRIVER = 'http';
      process.env.MAIL_PROVIDER_URL = 'https://mail.internal.example/send';
      process.env.SMTP_FROM_EMAIL = 'fallback@example.invalid';
      const fetchSpy = vi.fn(async () => makeFetchResponse(true, {}) as any);
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      await sendMail({ to: 'player@example.invalid', subject: 'Ping' });

      const [url, init] = fetchSpy.mock.calls[0] as [
        string,
        RequestInit & { body: string },
      ];
      expect(url).toBe('https://mail.internal.example/send');
      expect(JSON.parse(init.body).from).toBe('fallback@example.invalid');
    });

    it('throws with status and body excerpt on a non-2xx response', async () => {
      process.env.MAIL_DRIVER = 'http';
      const fetchSpy = vi.fn(
        async () =>
          makeFetchResponse(false, { message: 'quota exceeded' }, 429) as any,
      );
      globalThis.fetch = fetchSpy as unknown as typeof fetch;

      await expect(
        sendMail({ to: 'player@example.invalid', subject: 'Ping' }),
      ).rejects.toThrow(/429/);
      await expect(
        sendMail({ to: 'player@example.invalid', subject: 'Ping' }),
      ).rejects.toThrow(/quota exceeded/);
    });
  });

  describe('smtp driver', () => {
    it('builds the preserved transport settings and routes the message', async () => {
      process.env.MAIL_DRIVER = 'smtp';
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '2465';
      process.env.SMTP_USER = 'synthetic-user';
      process.env.SMTP_PASSWORD = 'synthetic-pass';
      process.env.SMTP_FROM_EMAIL = 'no-reply@example.invalid';
      const transportSendMail = vi.fn(
        async () => ({ messageId: 'smtp-msg-1' }) as any,
      );
      createTransportSpy.mockReturnValue({ sendMail: transportSendMail });

      const result = await sendMail({
        to: 'player@example.invalid',
        subject: 'Email Change',
        text: 'synthetic text',
      });

      expect(result).toEqual({ messageId: 'smtp-msg-1' });
      expect(createTransportSpy).toHaveBeenCalledTimes(1);
      expect(createTransportSpy).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 2465,
        secure: true,
        connectionTimeout: 30_000,
        socketTimeout: 60_000,
        auth: { user: 'synthetic-user', pass: 'synthetic-pass' },
        tls: { rejectUnauthorized: true },
      });
      expect(transportSendMail).toHaveBeenCalledWith({
        from: 'OpenThrone <no-reply@example.invalid>',
        to: 'player@example.invalid',
        subject: 'Email Change',
        text: 'synthetic text',
      });
    });

    it('propagates transport failures to the caller', async () => {
      process.env.MAIL_DRIVER = 'smtp';
      process.env.SMTP_HOST = 'smtp.example.com';
      createTransportSpy.mockReturnValue({
        sendMail: vi.fn(async () => {
          throw new Error('synthetic SMTP failure');
        }),
      });

      await expect(
        sendMail({ to: 'player@example.invalid', subject: 'Ping' }),
      ).rejects.toThrow('synthetic SMTP failure');
    });
  });
});
