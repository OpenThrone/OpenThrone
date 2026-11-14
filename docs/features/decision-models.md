# Decision models and shadow chat moderation

Status: phases A and B of #448, on `feat/decision-models`. Measure-only; nothing is enforced.
Last verified against code: 2026-11-11 (9b173b10)

A small provider layer asks typed questions of a "System One" decision model
(TypeSafe's hosted Jev, or self-hosted Kev/Clef through Kev's server or
Ollaya), plus an offline heuristic baseline. The first consumer is
**shadow-mode chat moderation**: recent chat messages are classified in the
background and the verdict is recorded next to what our policy would have done,
so staff can measure the false-positive rate before anything is enforced.

## Provider layer

Code: [`src/lib/decisions/`](../../src/lib/decisions/index.ts).

- A request is a `state` (text or structured data) and named questions of three
  kinds: `noul` (probability of yes), `choice` (one of 1-255 options) and `score`
  (mean level index from 0). Responses are validated with zod
  ([types](../../src/lib/decisions/types.ts)); a malformed or partial response is
  a `DecisionProviderError`, never a verdict.
- `SystemOneProvider` ([source](../../src/lib/decisions/systemOneProvider.ts))
  posts to `{baseUrl}/v1/systemone` with `Authorization: Bearer <key>` (the key is
  optional for self-hosted servers). It uses only `fetch` and `AbortController`, so
  it runs on Node and Cloudflare Workers. Default timeout 8 s, one retry after a
  short backoff on 429, 5xx, timeout or network failure. Errors carry the HTTP
  status only: never the key, the request or the response body. Gateways such as
  OpenRouter use the same shape with other model ids, so base URL and model are
  configuration.
- `HeuristicProvider` ([source](../../src/lib/decisions/heuristicProvider.ts)) is
  the default and the test baseline: deterministic, offline keyword and pattern
  scoring for harassment, threats and spam signals (repeated characters or
  words, links, all caps). It does not ship a slur list. For other questions it answers 0 or the first option unless given a
  scorer.
- `getDecisionProvider()` reads the environment. An incomplete `systemone`
  configuration falls back to the heuristic provider, so chat never goes to an
  endpoint nobody configured.

| Variable | Meaning |
| --- | --- |
| `DECISION_PROVIDER` | `heuristic` (default) or `systemone` |
| `DECISION_API_BASE_URL` | Origin of the System One server or gateway, without `/v1/systemone` |
| `DECISION_API_KEY` | Bearer key; optional for self-hosted servers. Set as a secret, never a plain var |
| `DECISION_MODEL` | Model id, for example `jev-latest` or `kev-latest` |
| `DECISION_TIMEOUT_MS` | Optional per-call timeout, default 8000, clamped to 1000-120000; 0 or negative means unset. A self-hosted Kev on one GPU answers the sweep's four concurrent calls in turn (Kev-4B on an RX 9070 XT: about 4 s each, 16-18 s for four), so set about 30000 there |

## Shadow chat moderation

Code: [service](../../src/services/ChatModerationShadow.service.ts),
[questions](../../src/lib/decisions/chatModerationQuestions.ts),
[policy](../../src/lib/decisions/chatModerationPolicy.ts).

- **Off by default.** Runtime setting `moderation.shadowEnabled` (group "Abuse
  detection", System → Server settings). `moderation.shadowBatchSize` (1-200,
  default 25) bounds one sweep.
- **Never on the send path.** A cron endpoint,
  [`/api/cronJobs/chatModeration`](../../src/pages/api/cronJobs/chatModeration.ts),
  runs every 30 minutes with the other frequent jobs (same `DO_TURN_UPDATES`
  switch and raw `TASK_SECRET`; recorded in the cron run log as `chatModeration`).
  Each sweep takes the next batch of non-deleted `TEXT` messages from the last 24
  hours that have no verdict yet, four at a time.
- **Questions:** `harassment` (noul), `severity` (score: harmless, mildly hostile,
  harassment, severe abuse), `recommended_action` (choice: allow, flag, hide) and
  `spam` (noul). The provider receives the message text (cut at 2000 characters)
  and a room context (`alliance`, `private` or `public` chat): no usernames, ids,
  emails or timestamps.
- **Policy** (our code, not the model's): spam at 0.9 or above, or harassment at
  0.9 with severity 2.5, is `would_block`; harassment 0.5, severity 1.5 or spam 0.6
  is `flag`; the model asking for flag or hide on its own only ever raises `allow`
  to `flag`. No policy output bans anyone. Shadow mode records the policy action
  and does nothing else: nothing is hidden, deleted or sanctioned.
- **Storage:** table `ChatModerationVerdict`, one row per message and
  provider/model, deleted with the message (`ON DELETE CASCADE`), row level
  security on. A failed provider call is stored as an `error` verdict (status
  only) so the message is not retried and paid for on every sweep. The exception
  is a provider that cannot be reached at all (connection refused, DNS, reset):
  the sweep then stops, writes nothing and reports `providerUnavailable`, so a
  later sweep picks the messages up. This lets a self-hosted Kev run only while a
  task is up. Timeouts and HTTP errors still record an `error` verdict, so one
  message the provider chokes on cannot block the queue.

### Measuring false positives

Staff open **Administration → Moderation → Chat Shadow Moderation**
(`/home/admin/moderation-shadow`, `VIEW_CHAT_LOGS`). It lists verdicts with the
message excerpt, room type, harassment %, severity, the model's advice, our policy
action and provider/model, filterable by policy action, 25 per page (hard cap 100
per request, offset cap 10 000), with counts per action for the last 30 days.
Reviewers with `MODERATE_CHAT` mark a verdict `correct`, `false_positive` (a flag
or would-block that was wrong) or `false_negative` (an `allow` that should have
been caught). Each review stores `reviewedByUserId`, `reviewOutcome` and
`reviewedAt` and writes an `ADMIN_CHAT_MODERATION_SHADOW_REVIEW` audit entry;
reading the page writes `ADMIN_CHAT_MODERATION_SHADOW_READ`. The summary shows the
false-positive rate: false positives divided by reviewed flag and would-block
verdicts.

### Privacy

Sending player chat to a third party is a privacy change. Before
`DECISION_PROVIDER=systemone` points at a **hosted** provider on production, the
players need advance notice with an effective date (see #313 for the same rule on
analytics). The heuristic provider, or a self-hosted Kev/Clef/Ollaya server, keeps
the text in-house and needs no notice beyond what chat moderation already says.
Keep the setting off until that is settled.

## Playtesting (phase B)

AI-guided playtests run 10-20 bot kingdoms (hard maximum 200) through isolated,
seeded simulations and report balance signals and rule violations. The model only
chooses which action a bot takes; the game rules in [`src/sim`](../mechanics/balance-simulation.md) execute and
validate everything, so the output is data about the engine, not the model's
opinion. See [balance simulation](../mechanics/balance-simulation.md) for the
simulator itself.

Code: [`decisionAdvisor.ts`](../../src/sim/decisionAdvisor.ts),
[`decisionPlaytest.ts`](../../src/sim/decisionPlaytest.ts), CLI
[`scripts/run-decision-playtest.ts`](../../scripts/run-decision-playtest.ts).

```
bun run sim:playtest -- --kingdoms 16 --days 7 --seed 42 --mode model
```

| Flag | Meaning |
| --- | --- |
| `--kingdoms` | 16 by default, 2-200 |
| `--days` | Simulated days, default 7 |
| `--seed` | Same seed and settings give the same run |
| `--mode` | `model` (provider chooses), `random-legal` (uniform random legal option, never calls a provider) or `legacy` (the built-in behavior model, as the baseline) |
| `--epsilon` | Share of `model` decisions replaced by a random legal option, default 0.1, so the model does not only explore its favourite strategy |
| `--max-decisions` | Hard cap on provider calls (default 5000). Required when the provider is hosted |
| `--out` | Output directory, default `temp/decision-playtest/<timestamp>` (git-ignored); writes `report.json` |

- **Hook.** `SimulationConfig.decisionAdvisor` is called once per player round,
  after the built-in decision is made. It owns its own seeded random generator, so
  with no advisor the run is unchanged, and with a pass-through advisor it is
  identical.
- **Legal options only.** Each round the advisor builds candidates from the
  built-in decision and the current state: `attack_best`, `attack_weakest` (the
  weakest defense among targets in level range and not allied), `spy`, `train`,
  `defend` (defensive recruits), `bank` and `save`. A candidate appears only when
  it is open now (turns held, target in range, units affordable, citizens
  available, bank deposits left). A player the built-in model left idle stays
  idle. Rounds with fewer than two options are not sent to the model.
- **One question per round.** A `choice` question with the options and a compact
  state with no identities: objective, race, level, gold band, turns, offense and
  defense scores, fort, and up to five target summaries. The answer must be one
  of the offered options; otherwise (wrong answer, provider error, budget spent)
  the built-in decision runs and the fallback is counted by reason.
- **Objectives.** Each kingdom gets one of `aggressive`, `economic`, `defensive`,
  `adaptive` by seed, independent of race, and every race (ELF, HUMAN, UNDEAD,
  GOBLIN) pairs with every objective once there are 16 kingdoms. They are
  illustrative, not racial behaviors. The offline `HeuristicProvider` plays them
  through a scorer ([`objectiveScorer`](../../src/sim/decisionAdvisor.ts)).
- **Findings.** Invariant errors from the simulator, plus cheap per-round checks:
  negative or non-finite gold, turns or units; fort HP outside 0..max; total gold
  rising inside a round (income is paid before rounds, loot only moves gold); an
  attack won with no offensive units. Each finding carries day, tick, player,
  the chosen option and decision, the seed and a state snapshot, which is enough
  to reproduce it. A thrown violation ends the run early (`completed: false`);
  the exit code is 2 when there are findings.
- **Report.** Per race x objective: final level, gold and power, attacks and win
  rate, gold lost to others, fallbacks and decisions by option; provider calls,
  fallbacks, explored decisions and mean latency; the findings.

### Cost

Hosted Jev bills per request. A run makes at most one request per acting kingdom
per round, so a long run can mean tens of thousands of requests: size it with
`--max-decisions` first (the CLI refuses a hosted provider without it). Self-hosted
Kev, Clef or Ollaya through `DECISION_API_BASE_URL` has no per-request fee and is
the cheaper choice at scale. The default provider is the offline heuristic.

## Admin parity

No new player state. Staff surfaces: the verdict page above, the two runtime
settings in Server settings, the cron run log entry.

## Tests

- [`src/lib/decisions/decisions.test.ts`](../../src/lib/decisions/decisions.test.ts):
  schema (good, malformed, partial), provider headers, retry, timeout and no key in
  errors, heuristic outputs on the issue's example and a benign message, policy
  thresholds, factory fallback.
- [`ChatModerationShadow.service.test.ts`](../../src/__tests__/services/ChatModerationShadow.service.test.ts):
  runtime-setting gate, sweep selection (unclassified, non-deleted, `TEXT`, 24 h),
  batch size, privacy of the state, error verdicts, unreachable provider skipped
  and retried later, timeouts still recorded, listing caps, summary, review.
- [`moderation-shadow.api.test.ts`](../../src/__tests__/pages/api/admin/moderation-shadow.api.test.ts)
  and [`chatModeration.api.test.ts`](../../src/__tests__/pages/api/cronJobs/chatModeration.api.test.ts):
  permissions, pagination cap, audit, cron secret and switch, skipped-sweep report.
- [`src/sim/decisionPlaytest.test.ts`](../../src/sim/decisionPlaytest.test.ts):
  hook is a no-op when pass-through, random-legal play stays inside what the
  engine allows across seeds, illegal and failing providers fall back and are
  counted, the call budget, seeded exploration, every race x objective cell in
  the report, hosted-provider refusal, and findings (invariant, gold created,
  fort bounds, negative units) with snapshots.

## Known gaps

- Shadow only. Enforcement (hide, mute) waits for measured false-positive data and
  the owner's decision.
- Only new messages from the last 24 hours are classified; no backfill.
- A message whose call timed out or returned an HTTP error is not retried
  automatically (an unreachable provider is retried; see Storage).
- Self-hosted on CPU: Kev-0.8B answers in about 2 s per message; Kev-4B in
  half precision took 44-172 s on a desktop CPU and times out. Kev-4B needs a
  supported GPU (CUDA or ROCm).
- The heuristic word lists are English only and deliberately small.
- Direct messages and alliance chat are classified like public chat; whether
  private conversations may be sent to a hosted provider is a notice question
  (see Privacy).
- Playtests use the legacy (non-live) simulation rules, not the live-rules mode.
- Rounds run one provider call at a time; the simulation is sequential by design,
  so run several seeds in parallel processes for throughput.
- `attack_weakest` ranks by cost-weighted defense units and fort, not by the
  battle formula; the per-target daily attack limit is enforced by the engine,
  not pre-checked by the advisor.
- Playtests find rule violations and balance signals; they do not tune anything.
  Balance at scale and AI kingdoms in the live game are still ideas.
- The admin page has no deep link from a verdict to the full chat log.
- Advisor state uses each target's exact defense score (full information), unlike
  the persona observation layer's imperfect-information view, so a model bot
  knows more than a real player would.
- A 16-kingdom run puts one kingdom in each race x objective cell, so a single
  seed is a smoke test, not a balance result; compare many seeds before reading
  anything into a cell.
