import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { NextApiRequest } from 'next';

import {
  getIpAddress,
  getTrustedProxyAddresses,
  resolveClientIp,
} from './ipUtils';

type FakeRequest = {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

const makeRequest = (
  remoteAddress: string | undefined,
  headers: FakeRequest['headers'] = {},
): NextApiRequest =>
  ({
    headers,
    socket: remoteAddress === undefined ? undefined : { remoteAddress },
  }) as unknown as NextApiRequest;

const originalTrusted = process.env.TRUSTED_PROXY_IPS;

describe('client IP resolution for rate limits and audit logs', () => {
  beforeEach(() => {
    delete process.env.TRUSTED_PROXY_IPS;
  });
  afterEach(() => {
    if (originalTrusted === undefined) delete process.env.TRUSTED_PROXY_IPS;
    else process.env.TRUSTED_PROXY_IPS = originalTrusted;
  });

  it('ignores a spoofed cf-connecting-ip from an untrusted peer', () => {
    const req = makeRequest('203.0.113.9', {
      'cf-connecting-ip': '198.51.100.7',
    });
    expect(resolveClientIp(req)).toBe('203.0.113.9');
  });

  it('ignores a spoofed leftmost X-Forwarded-For entirely', () => {
    const req = makeRequest('203.0.113.9', {
      'x-forwarded-for': '1.2.3.4, 203.0.113.9',
    });
    expect(resolveClientIp(req)).toBe('203.0.113.9');
  });

  it('honours cf-connecting-ip when the peer is loopback', () => {
    const req = makeRequest('127.0.0.1', {
      'cf-connecting-ip': '198.51.100.7',
    });
    expect(resolveClientIp(req)).toBe('198.51.100.7');
  });

  it('treats an IPv4-mapped loopback peer as loopback', () => {
    const req = makeRequest('::ffff:127.0.0.1', {
      'cf-connecting-ip': '198.51.100.7',
    });
    expect(resolveClientIp(req)).toBe('198.51.100.7');
  });

  it('honours cf-connecting-ip from an explicitly configured proxy', () => {
    process.env.TRUSTED_PROXY_IPS = ' 10.0.0.5 , 10.0.0.6 ';
    const req = makeRequest('10.0.0.6', {
      'cf-connecting-ip': '2001:db8::1',
    });
    expect(resolveClientIp(req)).toBe('2001:db8::1');
  });

  it('falls back to the socket when the forwarded value is not an IP', () => {
    const req = makeRequest('127.0.0.1', {
      'cf-connecting-ip': 'not-an-ip',
    });
    expect(resolveClientIp(req)).toBe('127.0.0.1');
  });

  it('uses the first value when cf-connecting-ip is repeated', () => {
    const req = makeRequest('127.0.0.1', {
      'cf-connecting-ip': ['198.51.100.7', '198.51.100.8'],
    });
    expect(resolveClientIp(req)).toBe('198.51.100.7');
  });

  it('walks X-Forwarded-For from the right behind a loopback proxy', () => {
    const req = makeRequest('127.0.0.1', {
      'x-forwarded-for': '1.2.3.4, 198.51.100.7',
    });
    expect(resolveClientIp(req)).toBe('198.51.100.7');
  });

  it('skips trusted proxy hops in X-Forwarded-For', () => {
    process.env.TRUSTED_PROXY_IPS = '10.0.0.5';
    const req = makeRequest('10.0.0.5', {
      'x-forwarded-for': '1.2.3.4, 198.51.100.7, 10.0.0.5',
    });
    expect(resolveClientIp(req)).toBe('198.51.100.7');
  });

  it('accepts CIDR ranges in TRUSTED_PROXY_IPS', () => {
    process.env.TRUSTED_PROXY_IPS = '10.0.0.0/8, 2001:db8::/32';
    expect(
      resolveClientIp(
        makeRequest('10.20.30.40', {
          'x-forwarded-for': '198.51.100.7, 10.9.9.9',
        }),
      ),
    ).toBe('198.51.100.7');
    expect(
      resolveClientIp(
        makeRequest('2001:db8:1::2', { 'x-forwarded-for': '198.51.100.8' }),
      ),
    ).toBe('198.51.100.8');
    expect(
      resolveClientIp(
        makeRequest('11.0.0.1', { 'x-forwarded-for': '198.51.100.9' }),
      ),
    ).toBe('11.0.0.1');
  });

  it('prefers the X-Forwarded-For chain over cf-connecting-ip', () => {
    const req = makeRequest('127.0.0.1', {
      'cf-connecting-ip': '198.51.100.7',
      'x-forwarded-for': '198.51.100.8',
    });
    expect(resolveClientIp(req)).toBe('198.51.100.8');
  });

  it('resolves Cloudflare -> reverse proxy -> app to the real client', () => {
    process.env.TRUSTED_PROXY_IPS = '10.0.0.21, cloudflare';
    // Cloudflare appends the client, the LAN proxy appends the edge it saw.
    const req = makeRequest('::ffff:10.0.0.21', {
      'cf-connecting-ip': '198.51.100.7',
      'x-forwarded-for': '198.51.100.7, 172.70.1.2',
    });
    expect(resolveClientIp(req)).toBe('198.51.100.7');
  });

  it('ignores cf-connecting-ip on requests that bypass Cloudflare', () => {
    process.env.TRUSTED_PROXY_IPS = '10.0.0.21, cloudflare';
    // A direct hit on the proxy: the forged headers sit left of the real peer.
    const req = makeRequest('10.0.0.21', {
      'cf-connecting-ip': '198.51.100.7',
      'x-forwarded-for': '198.51.100.7, 203.0.113.50',
    });
    expect(resolveClientIp(req)).toBe('203.0.113.50');
  });

  it('expands the cloudflare keyword to edge ranges, IPv4 and IPv6', () => {
    process.env.TRUSTED_PROXY_IPS = 'Cloudflare';
    expect(
      resolveClientIp(
        makeRequest('104.16.0.1', { 'x-forwarded-for': '198.51.100.7' }),
      ),
    ).toBe('198.51.100.7');
    expect(
      resolveClientIp(
        makeRequest('2606:4700::1', { 'x-forwarded-for': '198.51.100.8' }),
      ),
    ).toBe('198.51.100.8');
    expect(resolveClientIp(makeRequest('11.0.0.1'))).toBe('11.0.0.1');
  });

  it('lists exact proxy addresses but not ranges', () => {
    process.env.TRUSTED_PROXY_IPS = '10.0.0.21, 10.0.0.0/8, cloudflare';
    expect(getTrustedProxyAddresses()).toEqual([
      '127.0.0.1',
      '::1',
      '10.0.0.21',
    ]);
  });

  it('strips ports and brackets from forwarded hops', () => {
    expect(
      resolveClientIp(
        makeRequest('127.0.0.1', { 'x-forwarded-for': '198.51.100.7:5123' }),
      ),
    ).toBe('198.51.100.7');
    expect(
      resolveClientIp(
        makeRequest('::1', { 'x-forwarded-for': '[2001:db8::7]:443' }),
      ),
    ).toBe('2001:db8::7');
  });

  it('stops at a malformed hop instead of trusting what lies left of it', () => {
    const req = makeRequest('127.0.0.1', {
      'x-forwarded-for': '198.51.100.7, not-an-ip',
    });
    expect(resolveClientIp(req)).toBe('127.0.0.1');
  });

  it('returns the leftmost hop when every hop is a trusted proxy', () => {
    const req = makeRequest('127.0.0.1', { 'x-forwarded-for': '::1' });
    expect(resolveClientIp(req)).toBe('::1');
  });

  it('returns undefined and a readable fallback when no socket exists', () => {
    const req = makeRequest(undefined);
    expect(resolveClientIp(req)).toBeUndefined();
    expect(getIpAddress(req)).toBe('No IP address detected.');
  });
});
