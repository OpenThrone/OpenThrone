export type UserDataFetchResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'unauthorized' }
  | { kind: 'failed'; error: unknown };

interface UserDataFetchOptions {
  /** Extra attempts after the first one for network errors and 5xx/429. */
  retries?: number;
  /** Base delay in ms; attempt n waits delayMs * n. */
  delayMs?: number;
  wait?: (ms: number) => Promise<void>;
}

const defaultWait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Fetches the signed-in player's data, retrying transient failures.
 *
 * Only a 401 means the session is gone. Network errors, 5xx and 429 are
 * retried; if they persist the caller gets `failed` and should keep the
 * player signed in rather than dropping them to the logged-out shell.
 */
export async function fetchUserDataWithRetry<T>(
  doFetch: () => Promise<Response>,
  { retries = 2, delayMs = 750, wait = defaultWait }: UserDataFetchOptions = {},
): Promise<UserDataFetchResult<T>> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await wait(delayMs * attempt);
    try {
      const response = await doFetch();
      if (response.status === 401) return { kind: 'unauthorized' };
      if (response.ok) {
        return { kind: 'ok', data: (await response.json()) as T };
      }
      lastError = new Error(`getUser responded ${response.status}`);
      const transient = response.status >= 500 || response.status === 429;
      if (!transient) break;
    } catch (error) {
      lastError = error;
    }
  }
  return { kind: 'failed', error: lastError };
}
