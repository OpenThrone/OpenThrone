import { HeuristicProvider } from './heuristicProvider';
import { SystemOneProvider } from './systemOneProvider';
import type { DecisionProvider } from './types';

export * from './chatModerationPolicy';
export * from './chatModerationQuestions';
export { analyzeModerationText, HeuristicProvider } from './heuristicProvider';
export { SystemOneProvider } from './systemOneProvider';
export * from './types';

export const DECISION_PROVIDER_KINDS = ['heuristic', 'systemone'] as const;

type EnvLike = Record<string, string | undefined>;

export const DECISION_TIMEOUT_MIN_MS = 1000;
export const DECISION_TIMEOUT_MAX_MS = 120_000;

/** Unset, unparseable, zero or negative keeps the provider default. */
export function parseTimeoutMs(raw: string | undefined): number | undefined {
  const value = Number(raw?.trim());
  if (!raw?.trim() || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(
    DECISION_TIMEOUT_MAX_MS,
    Math.max(DECISION_TIMEOUT_MIN_MS, Math.round(value)),
  );
}

/**
 * Builds the configured provider. `DECISION_PROVIDER` is `heuristic`
 * (default, offline) or `systemone` (needs `DECISION_API_BASE_URL` and
 * `DECISION_MODEL`; `DECISION_API_KEY` is optional for self-hosted servers).
 * `DECISION_TIMEOUT_MS` raises the per-call timeout (default 8 s, clamped to
 * 1-120 s) for a self-hosted server that answers concurrent calls in turn.
 * A misconfigured `systemone` falls back to the heuristic provider, so chat
 * data never goes anywhere unintended.
 */
export function getDecisionProvider(
  env: EnvLike = process.env,
  fetchFn?: typeof fetch,
): DecisionProvider {
  const kind = (env.DECISION_PROVIDER ?? 'heuristic').trim().toLowerCase();
  if (kind !== 'systemone') return new HeuristicProvider();
  const baseUrl = env.DECISION_API_BASE_URL?.trim();
  const model = env.DECISION_MODEL?.trim();
  if (!baseUrl || !model || !/^https?:\/\//i.test(baseUrl))
    return new HeuristicProvider();
  return new SystemOneProvider({
    baseUrl,
    model,
    apiKey: env.DECISION_API_KEY?.trim() || undefined,
    timeoutMs: parseTimeoutMs(env.DECISION_TIMEOUT_MS),
    fetchFn,
  });
}
