import { describe, expect, test } from 'bun:test';

import { prepareNextApp } from '@/server/nextStartup';

const VERSION_URL = 'https://registry.npmjs.org/-/package/next/dist-tags';
describe('Next startup advisory lookup', () => {
  test('bounds a stalled version lookup and restores fetch after preparation', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = ((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('timeout')),
        );
      })) as typeof fetch;
    const stub = globalThis.fetch;
    try {
      await prepareNextApp(
        {
          prepare: async () => {
            await expect(fetch(VERSION_URL)).rejects.toThrow('timeout');
          },
        },
        10,
      );
      expect(globalThis.fetch).toBe(stub);
    } finally {
      globalThis.fetch = original;
    }
  });
  test('passes unrelated requests through unchanged and restores on failure', async () => {
    const original = globalThis.fetch;
    const options = { headers: { 'x-test': 'synthetic' } };
    let received: unknown;
    globalThis.fetch = ((_input, init) => {
      received = init;
      return Promise.resolve(new Response('ok'));
    }) as typeof fetch;
    const stub = globalThis.fetch;
    try {
      await expect(
        prepareNextApp({
          prepare: async () => {
            await fetch('https://example.test/game', options);
            throw new Error('prepare failed');
          },
        }),
      ).rejects.toThrow('prepare failed');
      expect(received).toBe(options);
      expect(globalThis.fetch).toBe(stub);
    } finally {
      globalThis.fetch = original;
    }
  });
});
