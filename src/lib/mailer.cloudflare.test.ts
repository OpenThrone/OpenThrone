import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  vi,
} from 'bun:test';
import { silenceLogger } from 'test/utils/silenceLogger';

silenceLogger();

// The Worker env is mocked once over a mutable object that each test sets:
// bun module mocks are process-wide, and a second mock.module would leak into
// whichever test runs next under --randomize.
let mockEnv: Record<string, unknown> = {};
mock.module('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: mockEnv }),
}));

const { getMailDriver, parseSender, sendMail } = await import('./mailer');

const ENV_KEYS = [
  'MAIL_DRIVER',
  'MAIL_BINDING',
  'MAIL_FROM',
  'SMTP_FROM_EMAIL',
  'SMTP_HOST',
] as const;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

const send = vi.fn(async (_message: unknown) => ({ messageId: 'msg-1' }));

describe('cloudflare mail driver', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.MAIL_DRIVER = 'cloudflare';
    process.env.MAIL_FROM = 'no-reply@example.com';
    send.mockClear();
    mockEnv = { EMAIL: { send } };
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it('is selected by MAIL_DRIVER=cloudflare', () => {
    expect(getMailDriver()).toBe('cloudflare');
  });

  it('sends through the EMAIL binding with the sender split out', async () => {
    const result = await sendMail({
      to: 'player@example.com',
      subject: 'Reset your password',
      html: '<p>Hi</p>',
      text: 'Hi',
      headers: {
        'List-Unsubscribe': '<https://example.com/u>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    expect(result).toEqual({ messageId: 'msg-1' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({
      to: 'player@example.com',
      from: { email: 'no-reply@example.com', name: 'OpenThrone' },
      subject: 'Reset your password',
      html: '<p>Hi</p>',
      text: 'Hi',
      headers: {
        'List-Unsubscribe': '<https://example.com/u>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
  });

  it('omits empty headers and honors MAIL_BINDING and SMTP_FROM_EMAIL', async () => {
    delete process.env.MAIL_FROM;
    process.env.SMTP_FROM_EMAIL = 'OpenThrone Mail <mail@example.com>';
    process.env.MAIL_BINDING = 'NOTIFY';
    mockEnv = { NOTIFY: { send } };

    await sendMail({ to: 'a@example.com', subject: 'S', text: 'T' });

    const message = send.mock.calls[0][0] as Record<string, unknown>;
    expect(message.from).toEqual({
      email: 'mail@example.com',
      name: 'OpenThrone Mail',
    });
    expect('headers' in message).toBe(false);
  });

  it('throws when the binding is missing', async () => {
    mockEnv = {};
    await expect(
      sendMail({ to: 'a@example.com', subject: 'S', text: 'T' }),
    ).rejects.toThrow('needs the EMAIL send_email binding');
    expect(send).not.toHaveBeenCalled();
  });

  it('throws when no sender is configured', async () => {
    delete process.env.MAIL_FROM;
    await expect(
      sendMail({ to: 'a@example.com', subject: 'S', text: 'T' }),
    ).rejects.toThrow('needs MAIL_FROM');
  });

  it('keeps the binding error code in the thrown message', async () => {
    send.mockImplementationOnce(async () => {
      throw Object.assign(new Error('sender not verified'), {
        code: 'E_SENDER_NOT_VERIFIED',
      });
    });
    await expect(
      sendMail({ to: 'a@example.com', subject: 'S', text: 'T' }),
    ).rejects.toThrow('E_SENDER_NOT_VERIFIED: sender not verified');
  });
});

describe('parseSender', () => {
  it('handles bare, named and quoted senders', () => {
    expect(parseSender('a@example.com')).toEqual({
      email: 'a@example.com',
      name: 'OpenThrone',
    });
    expect(parseSender('"Game Mail" <b@example.com>')).toEqual({
      email: 'b@example.com',
      name: 'Game Mail',
    });
    expect(parseSender('<c@example.com>')).toEqual({
      email: 'c@example.com',
      name: 'OpenThrone',
    });
  });
});
