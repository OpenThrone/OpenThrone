import { describe, expect, it } from 'bun:test';

import { DEFAULT_BASE_URL, parseChatLoadtestArgs } from './loadtest-chat';
import { UsageError } from './loadtest-preview';

/**
 * Arg-parsing tests for the chat load harness (the pure surface exported for
 * this purpose). The https regression case matters: URL.protocol is
 * 'https:' (no slashes), and a literal 'https://' comparison once rejected
 * every https base URL — including the harness's own DEFAULT_BASE_URL.
 */

const readTickets = async () => ['t1', 't2'];

describe('parseChatLoadtestArgs', () => {
  it('accepts the https preview default', async () => {
    const config = await parseChatLoadtestArgs(
      ['--room', '8', '--tickets', 'tickets.txt'],
      readTickets,
    );
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(config.room).toBe(8);
    expect(config.tickets).toEqual(['t1', 't2']);
  });

  it('accepts an explicit https base URL', async () => {
    const config = await parseChatLoadtestArgs(
      [
        '--base-url',
        'https://openthrone-preview.example.workers.dev',
        '--room',
        '8',
        '--tickets',
        'tickets.txt',
      ],
      readTickets,
    );
    expect(config.baseUrl).toBe('https://openthrone-preview.example.workers.dev');
  });

  it('accepts a local http base URL for wrangler dev', async () => {
    const config = await parseChatLoadtestArgs(
      [
        '--base-url',
        'http://127.0.0.1:8787',
        '--room',
        '8',
        '--tickets',
        'tickets.txt',
      ],
      readTickets,
    );
    expect(config.baseUrl).toBe('http://127.0.0.1:8787');
  });

  it('rejects non-http(s) base URLs', async () => {
    expect(
      parseChatLoadtestArgs(
        ['--base-url', 'ftp://example.com', '--room', '8', '--tickets', 't'],
        readTickets,
      ),
    ).rejects.toThrow(UsageError);
  });
});
