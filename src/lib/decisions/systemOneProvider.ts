import {
  assertAnswersMatchQuestions,
  type DecisionProvider,
  DecisionProviderError,
  type DecisionRequest,
  type DecisionResult,
  SystemOneResponseSchema,
} from './types';

export const DEFAULT_SYSTEM_ONE_TIMEOUT_MS = 8000;
const RETRY_BACKOFF_MS = 400;

export interface SystemOneConfig {
  /** Origin and optional path prefix, without `/v1/systemone`. */
  baseUrl: string;
  /** Optional for self-hosted servers. Never logged or put in errors. */
  apiKey?: string;
  model: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global fetch (Node and Workers). */
  fetchFn?: typeof fetch;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const isRetryable = (status: number) => status === 429 || status >= 500;

/**
 * Calls a System One endpoint (TypeSafe Jev, self-hosted Kev/Clef through
 * Ollaya, or a gateway such as OpenRouter). Uses only `fetch` and
 * `AbortController`, so it runs unchanged on Node and Cloudflare Workers.
 * One retry on 429/5xx/network failure; errors carry the HTTP status only,
 * never the key, the request body or the response body.
 */
export class SystemOneProvider implements DecisionProvider {
  readonly name = 'systemone';

  private readonly config: SystemOneConfig;

  constructor(config: SystemOneConfig) {
    this.config = config;
  }

  get model() {
    return this.config.model;
  }

  get timeoutMs() {
    return this.config.timeoutMs ?? DEFAULT_SYSTEM_ONE_TIMEOUT_MS;
  }

  private get url() {
    return `${this.config.baseUrl.replace(/\/+$/, '')}/v1/systemone`;
  }

  async decide(request: DecisionRequest): Promise<DecisionResult> {
    const sleep = this.config.sleep ?? defaultSleep;
    let lastError: DecisionProviderError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(RETRY_BACKOFF_MS);
      try {
        return await this.attempt(request);
      } catch (error) {
        if (!(error instanceof DecisionProviderError)) throw error;
        lastError = error;
        const retryable =
          error.kind === 'network' ||
          error.kind === 'timeout' ||
          (error.kind === 'http' && isRetryable(error.status ?? 0));
        if (!retryable) throw error;
      }
    }
    throw lastError ?? new DecisionProviderError('Decision failed', 'network');
  }

  private async attempt(request: DecisionRequest): Promise<DecisionResult> {
    const fetchFn = this.config.fetchFn ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey)
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    try {
      let response: Response;
      try {
        response = await fetchFn(this.url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: this.config.model,
            state: request.state,
            questions: request.questions,
          }),
          signal: controller.signal,
        });
      } catch {
        throw controller.signal.aborted
          ? new DecisionProviderError('Decision request timed out', 'timeout')
          : new DecisionProviderError('Decision request failed', 'network');
      }
      if (!response.ok)
        throw new DecisionProviderError(
          `Decision provider returned HTTP ${response.status}`,
          'http',
          response.status,
        );
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        throw new DecisionProviderError(
          'Decision provider returned invalid JSON',
          'invalid-response',
        );
      }
      const parsed = SystemOneResponseSchema.safeParse(json);
      if (!parsed.success)
        throw new DecisionProviderError(
          'Decision provider response did not match the expected shape',
          'invalid-response',
        );
      assertAnswersMatchQuestions(request.questions, parsed.data.answers);
      return {
        answers: parsed.data.answers,
        provider: this.name,
        model: parsed.data.model ?? this.config.model,
        latencyMs: parsed.data.latency_ms ?? Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
