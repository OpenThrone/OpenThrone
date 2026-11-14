import { describe, expect, it, vi } from 'bun:test';

import {
  assertAnswersMatchQuestions,
  buildModerationState,
  CHAT_MODERATION_QUESTIONS,
  decideModerationPolicy,
  DecisionProviderError,
  DEFAULT_MODERATION_THRESHOLDS,
  getDecisionProvider,
  HeuristicProvider,
  SystemOneProvider,
  SystemOneResponseSchema,
} from './index';

const WORKED_EXAMPLE =
  "You're a worthless player. Quit the game, nobody wants you here.";

const goodAnswers = {
  harassment: { type: 'noul', noul: 0.93 },
  severity: { type: 'score', score: 1.44, confidence: 0.34 },
  recommended_action: {
    type: 'choice',
    choice: 'flag',
    confidence: 0.21,
    probabilities: { allow: 0.47, flag: 0.21, hide: 0.32 },
  },
  spam: { type: 'noul', noul: 0.02 },
};

const okResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const request = {
  state: buildModerationState('hello there', 'public'),
  questions: CHAT_MODERATION_QUESTIONS,
};

describe('System One response schema', () => {
  it('accepts a complete response', () => {
    const parsed = SystemOneResponseSchema.safeParse({
      model: 'jev-latest',
      answers: goodAnswers,
      usage: { input_tokens: 10, output_tokens: 2 },
      latency_ms: 120,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects malformed answers', () => {
    expect(
      SystemOneResponseSchema.safeParse({
        answers: { harassment: { type: 'noul', noul: 1.7 } },
      }).success,
    ).toBe(false);
    expect(SystemOneResponseSchema.safeParse({ model: 'x' }).success).toBe(
      false,
    );
    expect(
      SystemOneResponseSchema.safeParse({
        answers: { harassment: { type: 'mystery' } },
      }).success,
    ).toBe(false);
  });

  it('treats a partial response as an error', () => {
    const parsed = SystemOneResponseSchema.parse({
      answers: { harassment: goodAnswers.harassment },
    });
    expect(() =>
      assertAnswersMatchQuestions(CHAT_MODERATION_QUESTIONS, parsed.answers),
    ).toThrow(DecisionProviderError);
  });

  it('rejects a choice outside the options and a score above the top level', () => {
    const base = SystemOneResponseSchema.parse({ answers: goodAnswers });
    expect(() =>
      assertAnswersMatchQuestions(CHAT_MODERATION_QUESTIONS, {
        ...base.answers,
        recommended_action: { type: 'choice', choice: 'ban' },
      }),
    ).toThrow(DecisionProviderError);
    expect(() =>
      assertAnswersMatchQuestions(CHAT_MODERATION_QUESTIONS, {
        ...base.answers,
        severity: { type: 'score', score: 4 },
      }),
    ).toThrow(DecisionProviderError);
  });
});

describe('SystemOneProvider', () => {
  const build = (fetchFn: typeof fetch, extra = {}) =>
    new SystemOneProvider({
      baseUrl: 'https://api.example.test/',
      apiKey: 'sk-secret-key',
      model: 'jev-latest',
      fetchFn,
      sleep: async () => undefined,
      ...extra,
    });

  it('posts to /v1/systemone with bearer auth and the configured model', async () => {
    const fetchFn = vi.fn(async () =>
      okResponse({ model: 'jev-latest', answers: goodAnswers }),
    );
    const result = await build(fetchFn as unknown as typeof fetch).decide(
      request,
    );
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.example.test/v1/systemone');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-secret-key',
    );
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('jev-latest');
    expect(Object.keys(body.questions)).toContain('harassment');
    expect(result.provider).toBe('systemone');
    expect(result.answers.harassment).toEqual(goodAnswers.harassment);
  });

  it('omits Authorization when no key is configured (self-hosted)', async () => {
    const fetchFn = vi.fn(async () => okResponse({ answers: goodAnswers }));
    await build(fetchFn as unknown as typeof fetch, {
      apiKey: undefined,
    }).decide(request);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      undefined,
    );
  });

  it('retries once on 429 and then succeeds', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(okResponse({}, 429))
      .mockResolvedValueOnce(okResponse({ answers: goodAnswers }));
    const result = await build(fetchFn as unknown as typeof fetch).decide(
      request,
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.answers.spam).toEqual(goodAnswers.spam);
  });

  it('gives up after one retry and never leaks the key or message text', async () => {
    const fetchFn = vi.fn(async () =>
      okResponse({ detail: 'sk-secret-key' }, 503),
    );
    const provider = build(fetchFn as unknown as typeof fetch);
    const error = await provider
      .decide({
        ...request,
        state: buildModerationState('private words here', 'private'),
      })
      .catch((e: unknown) => e);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(DecisionProviderError);
    expect((error as DecisionProviderError).status).toBe(503);
    expect(String((error as Error).message)).not.toContain('sk-secret-key');
    expect(String((error as Error).message)).not.toContain('private words');
  });

  it('does not retry a 422', async () => {
    const fetchFn = vi.fn(async () => okResponse({}, 422));
    await expect(
      build(fetchFn as unknown as typeof fetch).decide(request),
    ).rejects.toBeInstanceOf(DecisionProviderError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('aborts on timeout and reports it without the key', async () => {
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new Error('aborted sk-secret-key')),
          );
        }),
    );
    const error = await build(fetchFn as unknown as typeof fetch, {
      timeoutMs: 10,
    })
      .decide(request)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DecisionProviderError);
    expect((error as DecisionProviderError).kind).toBe('timeout');
    expect((error as Error).message).not.toContain('sk-secret-key');
  });

  it('turns a malformed body into an invalid-response error', async () => {
    const fetchFn = vi.fn(async () =>
      okResponse({ answers: { harassment: 3 } }),
    );
    const error = await build(fetchFn as unknown as typeof fetch)
      .decide(request)
      .catch((e: unknown) => e);
    expect((error as DecisionProviderError).kind).toBe('invalid-response');
  });
});

describe('HeuristicProvider', () => {
  const run = async (text: string) => {
    const result = await new HeuristicProvider().decide({
      state: buildModerationState(text, 'public'),
      questions: CHAT_MODERATION_QUESTIONS,
    });
    const a = result.answers;
    if (
      a.harassment.type !== 'noul' ||
      a.spam.type !== 'noul' ||
      a.severity.type !== 'score' ||
      a.recommended_action.type !== 'choice'
    )
      throw new Error('unexpected answer types');
    return {
      harassment: a.harassment.noul,
      spam: a.spam.noul,
      severity: a.severity.score,
      choice: a.recommended_action.choice,
    };
  };

  it('flags the worked example from the issue', async () => {
    const out = await run(WORKED_EXAMPLE);
    expect(out.harassment).toBeGreaterThan(0.5);
    expect(['flag', 'hide']).toContain(out.choice);
    expect(out.severity).toBeGreaterThan(1.2);
  });

  it('allows a benign message', async () => {
    const out = await run('Good game! Want to join our alliance?');
    expect(out.harassment).toBeLessThan(0.1);
    expect(out.choice).toBe('allow');
    expect(out.severity).toBeLessThan(0.5);
  });

  it('is deterministic', async () => {
    expect(await run(WORKED_EXAMPLE)).toEqual(await run(WORKED_EXAMPLE));
  });

  it('detects spam signals and severe threats', async () => {
    const spam = await run(
      'BUY GOLD NOW http://a.example http://b.example !!!!!!!!!!',
    );
    expect(spam.spam).toBeGreaterThan(0.8);
    const threat = await run('kill yourself');
    expect(threat.choice).toBe('hide');
    expect(threat.severity).toBeGreaterThanOrEqual(2.5);
  });

  it('answers unknown choice questions with the first option', async () => {
    const result = await new HeuristicProvider().decide({
      state: 'hello',
      questions: {
        pick: { type: 'choice', criteria: { red: null, blue: null } },
      },
    });
    expect(result.answers.pick).toEqual({ type: 'choice', choice: 'red' });
  });
});

describe('moderation policy', () => {
  const base = {
    harassment: 0,
    severity: 0,
    spam: 0,
    recommended: 'allow' as const,
  };

  it('allows clean messages', () => {
    expect(decideModerationPolicy(base)).toBe('allow');
  });

  it('blocks obvious spam and flags likely spam', () => {
    expect(decideModerationPolicy({ ...base, spam: 0.95 })).toBe('would_block');
    expect(decideModerationPolicy({ ...base, spam: 0.7 })).toBe('flag');
  });

  it('flags ambiguous harassment and blocks only high-confidence severe abuse', () => {
    expect(decideModerationPolicy({ ...base, harassment: 0.6 })).toBe('flag');
    expect(
      decideModerationPolicy({ ...base, harassment: 0.95, severity: 2.8 }),
    ).toBe('would_block');
    expect(
      decideModerationPolicy({ ...base, harassment: 0.95, severity: 1.8 }),
    ).toBe('flag');
  });

  it('never lets the model recommendation alone block, and never bans', () => {
    expect(decideModerationPolicy({ ...base, recommended: 'hide' })).toBe(
      'flag',
    );
    const outputs = new Set(
      [0, 0.5, 0.95, 1].flatMap((h) =>
        [0, 1.5, 3].map((s) =>
          decideModerationPolicy({
            harassment: h,
            severity: s,
            spam: h,
            recommended: 'hide',
          }),
        ),
      ),
    );
    for (const action of outputs)
      expect(['allow', 'flag', 'would_block']).toContain(action);
  });

  it('honours custom thresholds', () => {
    expect(
      decideModerationPolicy(
        { ...base, harassment: 0.6 },
        { ...DEFAULT_MODERATION_THRESHOLDS, harassmentFlag: 0.7 },
      ),
    ).toBe('allow');
  });
});

describe('state sent to providers', () => {
  it('contains only the message text and a room context', () => {
    const state = buildModerationState('hi', 'alliance');
    expect(Object.keys(state).sort()).toEqual(['context', 'message']);
    expect(state.context).toContain('alliance');
  });
});

describe('getDecisionProvider', () => {
  it('defaults to the offline heuristic provider', () => {
    expect(getDecisionProvider({}).name).toBe('heuristic');
    expect(getDecisionProvider({ DECISION_PROVIDER: 'nonsense' }).name).toBe(
      'heuristic',
    );
  });

  it('builds a System One provider from env, and falls back when incomplete', () => {
    const configured = getDecisionProvider({
      DECISION_PROVIDER: 'systemone',
      DECISION_API_BASE_URL: 'https://api.example.test',
      DECISION_MODEL: 'kev-latest',
    });
    expect(configured.name).toBe('systemone');
    expect(configured.model).toBe('kev-latest');
    expect(getDecisionProvider({ DECISION_PROVIDER: 'systemone' }).name).toBe(
      'heuristic',
    );
    expect(
      getDecisionProvider({
        DECISION_PROVIDER: 'systemone',
        DECISION_API_BASE_URL: 'not a url',
        DECISION_MODEL: 'x',
      }).name,
    ).toBe('heuristic');
  });

  it('reads DECISION_TIMEOUT_MS, clamped, and keeps the 8 s default otherwise', () => {
    const build = (timeout?: string) =>
      getDecisionProvider({
        DECISION_PROVIDER: 'systemone',
        DECISION_API_BASE_URL: 'http://127.0.0.1:8019',
        DECISION_MODEL: 'kev-latest',
        DECISION_TIMEOUT_MS: timeout,
      }) as InstanceType<typeof SystemOneProvider>;
    expect(build().timeoutMs).toBe(8000);
    expect(build('nonsense').timeoutMs).toBe(8000);
    expect(build('0').timeoutMs).toBe(8000);
    expect(build('-5').timeoutMs).toBe(8000);
    expect(build('30000').timeoutMs).toBe(30000);
    expect(build('5').timeoutMs).toBe(1000);
    expect(build('999999').timeoutMs).toBe(120000);
  });
});
