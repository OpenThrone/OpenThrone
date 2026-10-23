/** Next dev's advisory npm version lookup must not delay the game server indefinitely. */
export async function prepareNextApp(
  app: { prepare: () => Promise<void> },
  timeoutMs = 5000,
) {
  const originalFetch = globalThis.fetch;
  const boundedFetch = ((input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url !== 'https://registry.npmjs.org/-/package/next/dist-tags')
      return originalFetch(input, init);
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const deadline = AbortSignal.timeout(timeoutMs);
    return originalFetch(input, {
      ...init,
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
  }) as typeof fetch;
  globalThis.fetch = boundedFetch;
  try {
    await app.prepare();
  } finally {
    // Next may install its own fetch instrumentation during preparation.
    if (globalThis.fetch === boundedFetch) globalThis.fetch = originalFetch;
  }
}
