import { describe, expect, it } from 'bun:test';

import {
  getRequestOrigin,
  isOriginAllowed,
  parseOriginList,
  setCorsHeaders,
} from './cors';

describe('cors utils', () => {
  it('parseOriginList splits and trims', () => {
    expect(parseOriginList('https://a.test, https://b.test,,')).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });

  it('getRequestOrigin prefers Origin header', () => {
    expect(
      getRequestOrigin({
        headers: { origin: 'https://dashboard-test.openthrone.dev' },
      }),
    ).toBe('https://dashboard-test.openthrone.dev');
  });

  it('getRequestOrigin falls back to Referer', () => {
    expect(
      getRequestOrigin({
        headers: { referer: 'https://dashboard-test.openthrone.dev/path?x=1' },
      }),
    ).toBe('https://dashboard-test.openthrone.dev');
  });

  it('isOriginAllowed supports exact match and wildcard', () => {
    expect(isOriginAllowed('https://a.test', ['https://a.test'])).toBe(true);
    expect(isOriginAllowed('https://b.test', ['https://a.test'])).toBe(false);
    expect(isOriginAllowed('https://anything.test', ['*'])).toBe(true);
  });

  it('setCorsHeaders sets headers only for allowed origins', () => {
    const headers = new Map<string, string | string[]>();
    const res = {
      setHeader: (name: string, value: string | string[]) =>
        headers.set(name, value),
      getHeader: (name: string) => headers.get(name),
    };

    setCorsHeaders(res, 'https://a.test', ['https://a.test']);
    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://a.test');
    expect(headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(headers.get('Vary')).toBe('Origin');

    const headers2 = new Map<string, string | string[]>();
    const res2 = {
      setHeader: (name: string, value: string | string[]) =>
        headers2.set(name, value),
      getHeader: (name: string) => headers2.get(name),
    };

    setCorsHeaders(res2, 'https://not-allowed.test', ['https://a.test']);
    expect(headers2.get('Access-Control-Allow-Origin')).toBeUndefined();
  });
});
