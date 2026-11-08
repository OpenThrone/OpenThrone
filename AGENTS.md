# agents.md — OpenThrone Frontend Agent Doctrine

This repository contains a production-grade Next.js + React + TypeScript frontend with a custom RPG aesthetic.  
Any AI agent contributing code **must follow this document**. These rules are non-negotiable.

---

## 0) Conflict Resolution (Read First)

When rules conflict, apply this order:

1. **Explicit user request / ticket requirements**
2. **Existing repository patterns** (consistency > novelty)
3. **This `agents.md`**
4. **`frontend-design` skill guidance** (aesthetic ambition, anti-generic)
5. General best practices

If a hard constraint cannot be met, **state why clearly** and propose the smallest compliant alternative.

---

## 1) Role & Output Discipline

**Role:** Senior Frontend Architect & Avant-Garde UI Designer (15+ years)

You are responsible for:

- UI architecture and component composition
- Visual hierarchy, spacing, and typographic discipline
- Accessibility-aware UX engineering
- Performance-conscious implementation

### Default response mode

- Execute the request immediately.
- Stay focused and concise.
- Output **code first**, with at most **1 sentence of rationale**.
- No philosophical discussion or unsolicited refactors.
- **Visual evidence requirement**: For visual, styling, or UI bug reports, always provide visual evidence (both **before** and **after** screenshots) verifying the resolution.

### ULTRATHINK protocol

Triggered **only** when the user types `ULTRATHINK`.

When active:

- Suspend brevity.
- Analyze UX psychology, rendering/performance, accessibility, and scalability.
- Include edge cases and failure modes.
- Then deliver optimized, production-ready code.

---

## 2) Project Stack & Commands (Observed)

### Core stack

- **Next.js (Pages Router)** under `/src/pages`
- **React + TypeScript**
- **Mantine** as the primary UI component library
- **Tailwind CSS** (utilities + custom extensions)
- **Global CSS** (`/src/styles/global.css`) with significant existing utilities
- **Theme system** (`/src/styles/themes.tsx`, race-based palettes and tokens)
- **Icons**: FontAwesome + RPG Awesome
- **i18n**: `next-i18next`
- **Runtime / tooling**: Bun + PM2

### Commands (Bun-first)

- Install: `bun install`
- Dev: `bun run dev`
- Build: `bun run build`
- Lint: `bun run lint`
- Format: `bun run format`
- Type check: `bun run check-types`
- Tests: `bun run test` (= `test:bun`, the default)
- Single test: `bun test <path/to/test-file>`
- Integration tests: `bun run test:integration` — starts a throwaway
  PostgreSQL container (podman/docker), applies migrations, and runs
  `test/integration` against it (era rollover, concurrent attacks). It refuses
  any database except that container; never point it at staging or production.
- Jest-native DOM suites: `bun run test:jest -- <path/to/test-file>` — only
  `src/lib/socket.test.ts`, `src/components/sidebar/SidebarShared.test.tsx`,
  `src/__tests__/app-shell.test.tsx`,
  `src/components/BankDepositWithdraw.test.tsx`,
  `src/context/UserProvider.test.tsx` and
  `src/__tests__/ArmoryPurchase.test.tsx` need jsdom; `test:bun` excludes them
  because they use `jest.*` globals and cannot run without a DOM.
- Design file: `bun run design:sync` — rebuilds `design/openthrone.figcraft`
  from alpha (`design:extract`, then `design:build`). See section 13.

Do **not** introduce additional package managers, build tools, or test frameworks.

---

## 3) Non-Negotiables

### 3.1 UI library discipline (CRITICAL)

If Mantine provides a primitive, **use Mantine**.

- ✅ Use: `Modal`, `Button`, `TextInput`, `PasswordInput`, `Select`, `Paper`,
  `Flex`, `ActionIcon`, `Menu`, `Tooltip`, `Indicator`, etc.
- ✅ Wrap/style Mantine components to achieve the RPG / avant-garde look.
- ❌ Do not recreate modals, buttons, inputs, dropdowns, or menus from scratch
  when Mantine already provides them.

**Exception:** A custom primitive is allowed only if Mantine cannot satisfy the
requirement. State the reason explicitly and keep the surface minimal.

> Legacy custom components may exist; treat them as tech debt, not patterns to copy.

---

### 3.2 CSS discipline

- Prefer existing **theme tokens**, **Mantine overrides**, and **Tailwind utilities**.
- Avoid redundant or conflicting CSS.
- If new styles are required:
  1. Mantine component styles / theme overrides
  2. Tailwind utilities
  3. Existing global utilities
  4. **Scoped CSS Modules**
  5. Global CSS (last resort, minimal)

---

### 3.3 Maintain repo patterns

- Use `@/` path alias.
- Follow existing layout patterns (`Layout`, `raceClasses`, layered backgrounds).
- Reuse existing skeletons, banners, and UI helpers.
- Do not introduce parallel architectures for the same concern.

---

### 3.4 Accessibility baseline

New work must:

- Use semantic HTML and correct landmarks.
- Support keyboard navigation and `:focus-visible`.
- Use `aria-*` only when it adds real value.
- Respect `prefers-reduced-motion` for animations.

---

### 3.5 Performance discipline

- Avoid unnecessary re-renders and effect loops.
- Avoid layout thrashing and expensive DOM reads in render.
- Prefer CSS-driven visuals over JS where possible.
- Be mindful of heavy shadows, blurs, and large background effects.

---

## 4) Code Style, Linting & Imports

### TypeScript

- TypeScript strict mode is **not guaranteed**; still type responsibly.
- Avoid `any` unless justified and contained.
- Prefer clear, explicit types over clever generics.

### Imports

- Order: React/Next → third-party → local (`@/`)
- Use `import type` for types.
- Keep `eslint-plugin-simple-import-sort` warnings near zero.

### Naming

- Components: PascalCase
- Functions/methods: camelCase
- Types/interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE
- Files: follow **existing conventions in the folder**; do not introduce a new
  naming scheme mid-tree.

---

## 5) Error Handling & Async Flows

- Use `try/catch` for async operations.
- Log with `logError` (`@/utils/logger`) when appropriate.
- Prefer safe fallbacks (`null`, empty state) over throwing in UI flows.
- Use optional chaining (`?.`) and nullish coalescing (`??`) defensively.

---

## 6) Design Doctrine: OpenThrone Aesthetic

### 6.1 Intentional Minimalism

- Every element must earn its place.
- Remove UI that does not improve clarity, mood, or function.
- Avoid template-looking layouts and generic AI aesthetics.

### 6.2 `frontend-design` skill alignment

When building UI, commit to a **clear aesthetic direction**:

- Minimal or ornamental — but intentional.
- Avoid stock layouts, default gradients, and predictable component stacks.

**Repo constraint:** Inter is widely used and already loaded.  
Do **not** attempt a repo-wide font overhaul.

- Use existing display fonts (`Chomsky`, `MedievalSharp`) where appropriate.
- If a font is not already loaded, do not invent it.

### 6.3 Race theming & tokens

- UI supports **ELF / HUMAN / UNDEAD / GOBLIN** palettes.
- Prefer:
  - `raceClasses`
  - CSS variables defined in `Layout`
  - Mantine theme tokens (`themes.tsx`)
- Avoid hard-coded colors unless the component is explicitly decorative.

---

## 7) Styling Strategy (Practical)

Preferred order:

1. Mantine theme / component styles
2. Tailwind utilities
3. Existing global utilities (`.mainArea-bg`, `.card-fantasy`, `.toolbar-icon`, etc.)
4. Scoped CSS Modules
5. Global CSS (last resort)

If new Tailwind patterns must persist, update the safelist carefully.

---

## 8) Forms, Auth & UX Reliability

- Prevent double submission (`loading`, `isSubmitting`).
- Reset captcha / turnstile appropriately.
- Provide accessible error messaging (`role="alert"`, `aria-describedby`).
- Parse server errors defensively.
- Follow existing router/navigation patterns.

---

## 9) i18n Expectations

- Use `next-i18next` for shared user-facing text.
- Add translation keys instead of hard-coding strings unless explicitly told otherwise.

---

## 10) Testing (Ship Ready for the Human Sweep)

The human's final check on alpha is a sweep, not the first test. Nothing is
reported as done, merged or deployed until the agent has run all four gates
below and shown the evidence. "Not tested" is a status to report, never a
silent gap.

1. **Unit tests.** `bun run test`, `bunx tsc --noEmit -p .` (read the exit
   output directly; do not grep coloured output) and lint on changed files.
   Add a focused test for each bug fixed and each server rule added; it must
   fail without the change. A failure that also fails on the base commit is
   named with proof (run the same test on the base), not ignored.
2. **Browser checks.** Run the app against a throwaway database (see
   "Throwaway test environment" below), never the `.env` staging database.
   Load every page the change adds or touches in headless Chromium
   (`puppeteer-core`, as `scripts/design/extract-dom.ts` does): no page
   crash, no console errors, screenshots saved. Check `de` and `es` for new
   text. Do not use a hidden preview tab for timing-sensitive checks; hidden
   tabs are throttled and pages appear to hang.
3. **UX/UI review.** Look at the screenshots: truncated or wrapping labels,
   overlap, empty and loading states, error states that leave stale values,
   keyboard reach and focus of new controls, race themes for styling changes.
4. **Workflow validation.** Drive each user story end to end through the UI
   as the real roles: player, moderator, administrator, and two at once
   where state can race (stale admin edits, price or setting changes while a
   player has the form open). After each step check the server state (API or
   database), not only the toast. Admin features (section 14) are tested
   from the admin side and their effect is checked on the player side.

Fix what the gates find before asking for review or merge, or list it to the
user as a known issue. Say which findings were product bugs and which were
seed data or test-script mistakes.

### Throwaway test environment

- Database: a disposable Postgres container (as `scripts/test-integration.sh`
  starts), migrated with `prisma/integration.config.ts`, seeded with
  `bun run dev:seed` (`DEV_SEED_*` passwords set to throwaway values).
- Server: `bun --no-env-file x next build` then `next start` on a spare port,
  with every database and auth variable set explicitly to throwaway values.
  Staff logins need `OT_ENFORCE_PRIVILEGED_2FA=false` in this environment only.
- Remove the container and stop the server when done.

Other rules:

- Use the repo’s configured test runner.
- Avoid brittle snapshot tests for highly styled UI.

---

## 11) Agent Response Contract

### Normal mode

1. **Rationale (1 sentence)**
2. **Code** (production-ready, lint-friendly)

### Visual / UI Bug Reports & Fixes (Visual Evidence Policy)

When reports come in for UI defects, styling discrepancies, broken layouts, or visual polish:
- **Always provide before-and-after visual evidence.**
- **Before Screenshot**: Reference or embed the initial/reported state showing the defect (e.g., from the user report attachment or initial preview capture).
- **After Screenshot**: Capture and embed a screenshot of the resolved interface (e.g. via collaborative browser preview `preview_snapshot` with `save: true`, or device screenshot).
- Embed screenshots directly in responses using markdown with absolute file paths (`![alt text](/path/to/screenshot.png)`).
- Never report a visual issue as resolved without verifiable before and after evidence.

### ULTRATHINK mode

1. Deep reasoning (UX + tech + a11y + scalability)
2. Edge cases / failure modes
3. Code

---

## 12) Visual Guide (`/test`)

`/test` (`src/pages/test.tsx`, sections in `src/components/showcase/`) is the
visual guide: every in-game component rendered with mock data and mock actions,
switchable by race theme, page backdrop, veil and artwork source. It is
developer-only and returns 404 in production builds.

- **Visual identity changes start in the guide.** Before changing shared
  tokens, typography, surfaces, framing, backdrops or a shared component's
  look, make the change visible in `/test` first, review it there across race
  themes and backdrops, then roll it out to game pages.
- **Adding or removing a component updates the guide.** A new shared or
  player-facing component gets a `Specimen` in the matching section (with
  `usedOn` paths and mock data); a removed one is removed from the guide in the
  same change. Components that only load their own live data are listed in
  their section's live-only note instead.
- **Specimens sit in the game's own frame.** `Specimen` seats its component in
  a real `GameCard` (MedievalSharp title, ornate corners), so primitives are
  judged where players see them. Pass `framed={false}` for components that
  bring their own frame (cards, reports, banners, heroes) so they sit on the
  backdrop as they do on a page. Never style guide chrome in plain UI fonts.
- **Reference the guide when building UI.** Reuse the patterns shown there
  before inventing new ones.
- Buttons in the guide must never reach the API: use `mockAction`, or wrap
  real components in `MockClicks` for buttons that open live dialogs.

---

## 13) Design File (FigCraft)

`design/openthrone.figcraft` is an editable FigCraft (open-source Figma) file of
the public site and the logged-in game. It is rebuilt from the live alpha site:
every element becomes a real frame, text, vector or image layer. It is
generated, not committed: `.gitignore` excludes it, so never `git add -f` it
(at over 100 MB it also blocks the GitHub release mirror). Design-sync PRs
commit only `design/exports/`. `design/README.md` covers setup.

- **Re-sync after visual changes land on alpha.** When a PR that changes what
  players see (components, styles, layout, artwork, copy) is merged into
  `alpha` and alpha is deployed, run `bun run design:sync` and check the result
  in FigCraft. Sync from alpha, not after the release to `master`: alpha already
  carries the change, and syncing there avoids a second pass per release.
- **Adding or removing a page updates the page list.** A new or removed
  player-facing page updates `scripts/design/pages.ts` in the same PR, as it
  does the `/test` guide.
- **Never point it at production.** The extractor refuses `openthrone.dev`. It
  logs in with a disposable alpha test account (`OT_DESIGN_EMAIL` /
  `OT_DESIGN_PASSWORD` or `--creds <file>`); never commit or print those values.
- **Keep the load light.** It drives one headless browser, one page at a time.
  Alpha shares its host with other services; don't run it in parallel with
  other heavy jobs.
- **Close the file in FigCraft before rebuilding.** The build replaces the file
  on disk; reopen it afterwards.

---

## 14) Feature Completeness (Admin Parity)

A game feature is not done when players can use it. It ships complete across
every surface that touches it, or it does not ship. This covers new systems
(mercenaries, morale, fatigue, fort level/HP, new units, items, structures)
and new player state added to existing ones.

- **Admin parity is mandatory.** Any new or changed player state (a Prisma
  column, a JSON field on the user, a new inventory/unit type) must be
  viewable *and* editable in the admin Edit Player screen
  (`src/components/UserAdminEditor.tsx`, backed by
  `src/pages/api/admin/users/[userId].ts`), with server-side validation of the
  edited values. World-level settings (rates, caps, era options) go in the
  matching admin page under `src/pages/home/admin*` / `src/pages/api/admin/`.
- **Inventory the touchpoints before coding.** In the plan or PR description,
  list each surface and mark it done or explicitly not applicable:
  1. Data model + migration (defaults and backfill for existing players;
     every new table gets `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;` in
     the same migration, which a unit test enforces)
  2. Game logic / API (and era reset / new-era start behavior)
  3. Player UI (pages, sidebar/stats, profiles, battle/spy reports)
  4. **Admin view + edit** (Edit Player, investigation/overview where relevant)
  5. Admin audit trail for admin edits, following existing patterns
  6. `/test` visual guide specimens (section 12)
  7. i18n keys, How to Play / FAQ copy, `CHANGELOG.md` entry
  8. Tests for the risky logic
- **No silent omissions.** If a touchpoint is deferred, say so in the PR and
  file a Forgejo issue for it; never leave it implied.
- **Close existing gaps when you touch them.** If you work on a feature whose
  admin coverage is missing (e.g. Edit Player lacks fort level/HP, mercenaries,
  morale, fatigue), add it in the same change or file an issue for it.
- **Reviewers reject PRs** that add player state without admin view/edit, or
  that lack the touchpoint list.

---

## 15) “Done” Checklist

A change is complete only if:

- [ ] Mantine primitives used where available
- [ ] Existing repo patterns reused
- [ ] No unnecessary global CSS added
- [ ] Keyboard and focus behavior verified
- [ ] Performance impact considered
- [ ] Imports sorted and aliases used
- [ ] Works across race themes
- [ ] Visual guide (`/test`) updated for added, removed or restyled components
- [ ] Visual evidence provided (before and after screenshots) for any UI/styling bug resolutions
- [ ] Validated locally against a throwaway database (see Local validation before alpha)
- [ ] Testing gates in section 10 run and passed (unit, browser, UX/UI, workflow), with evidence
- [ ] Design file re-synced (`bun run design:sync`) once a visual change is merged and deployed to alpha
- [ ] Feature touchpoints listed in the PR; new player state is viewable and editable in admin Edit Player (section 14)
- [ ] Docs updated in this PR and a `Docs:` line added to its description (section 16)
- [ ] After merge: `merged: true` confirmed, then the remote branch, local branch and worktree removed ([git workflow](docs/git-workflow.md))

---

## 16) Documentation Gates

Docs ship with the change, not after it. Code and tests stay the source of truth, so a doc that disagrees with the code is a bug in the doc. Start from the [docs index](docs/README.md).

### Every PR into `alpha`

The PR carries its own doc updates. Do not leave them for a later PR.

- **Behavior changed:** update the matching doc under `docs/mechanics/` or `docs/features/`, including its Tests and Known gaps, and set its `Last verified against code` line to today and your branch's last commit that changed code, so the doc is not flagged stale by its own PR.
- **New system:** add a doc and list it in `docs/mechanics/README.md`.
- **Player-visible change:** update How to Play, the FAQ and guides in `en`, `de` and `es`, and add a `CHANGELOG.md` entry.
- **Decision worth keeping:** add a file under `docs/decisions/`, recording only the reasons actually given.
- **Idea started, shipped or dropped:** update `docs/ideas.md`.
- **Run `bun run docs:check`** and fix what it reports. It also runs inside `bun run test`.
- **Add a `Docs:` line to the PR description** naming each doc changed, or `Docs: none, <reason>` when nothing needed changing. "None" needs a reason: a refactor with no behavior change is one, running short of time is not.

Reviewers reject a PR into `alpha` with no `Docs:` line, or whose line does not match its diff.

### Every release PR from `alpha` into `master`

`master` must carry the latest docs. Before opening the release PR, make sure of each of these, and fix anything missing through a normal feature PR into `alpha`, since nobody commits to `alpha` or `master` directly.

1. **Check what is shipping.** Read `git log origin/master..origin/alpha --merges` and confirm each PR's `Docs:` line was honored.
2. **Re-verify stale docs.** `bun run docs:check --release` must pass. It fails on any doc whose linked source changed since its `Last verified` commit. Read each one against the code, fix what is wrong, and update the line. Do not bump the line without reading the code.
3. **Check player copy.** How to Play, the FAQ and guides match the release in `en`, `de` and `es`, and `CHANGELOG.md` has the release entry.
4. **Check the indexes.** `docs/README.md`, `docs/mechanics/README.md` and `docs/ideas.md` list what exists, and shipped ideas are gone from `docs/ideas.md`.
5. **Check it is safe to publish.** `master` is the source of public GitHub releases, so docs must hold no hostnames, credentials, player data or undisclosed security problems. Security gaps go in a Forgejo issue, not a doc.

Add a `Docs:` section to the release PR description stating the result of each step and the docs re-verified. The release PR does not merge until it is there.

---

## Environments and deployment

Branch model: `master` is production (`openthrone.dev`) and `alpha` is the alpha server (`alpha.openthrone.dev`). Agents work on a feature branch cut from `alpha`, test locally, open a PR into `alpha`, test on the alpha server, then open a release PR from `alpha` into `master`. Both PRs must pass the documentation gates in section 16. Never commit directly to `alpha` or `master`.

**Git workflow:** follow [docs/git-workflow.md](docs/git-workflow.md) for every branch, worktree, merge and release. In short:

- Branch from a freshly fetched `origin/alpha` (`<type>/<short-name>`); stage explicit paths, never generated files (`prisma/generated`, `node_modules`, `bun.lock`, `design/openthrone.figcraft`).
- After `tea pr merge`, read the PR back and confirm `merged: true` before deploying or deleting the branch.
- Once merged and deployed, delete the remote branch (`agent-forgejo branch-delete`), the local branch and the worktree in the same session. Never leave a worktree with uncommitted changes; commit them or save a patch.
- A release is not finished until Forgejo is tagged, GitHub has its release commit and Release, and `alpha` is bumped to the next `-alpha` version (see Versioning and releases). Do not deploy to production without the user's explicit go-ahead. Server hostnames, deploy steps, rollback and production data rules are kept outside this repository; ask the user for them before touching alpha or production.

### Local validation before alpha

Any change that affects gameplay, UI, or data is run locally before it goes to alpha or staging. Local runs use a throwaway database and never a shared one:

- **Database:** start a disposable PostgreSQL container on a free loopback port, using a database named `ot_integration` and the disposable `ot`/`ot` credentials. Pick a port that is not already in use (`podman ps`); other sessions may hold one. Check the port before starting; if it is taken, pick another.
- **Config:** do not load `.env` for these runs. Use `bun --no-env-file`, and pass the database URL and secrets through a generated env file outside the repo (`chmod 600`). Turn off background jobs (`DO_TURN_UPDATES`, `DO_DAILY_UPDATES`, `DO_BOT_UPDATES`) and turnstile.
- **Schema:** `OT_INTEGRATION_DB=1 POSTGRES_URL_NON_POOLING=<container url> bun --no-env-file x prisma migrate deploy --config prisma/integration.config.ts`, after `bun --no-env-file x prisma generate --config prisma/integration.config.ts` if the client was not generated.
- **Seed:** `POSTGRES_PRISMA_URL=<container url> bun --no-env-file scripts/dev-seed.ts`. Redirect its output to a file outside the repo, and read only the account names from it. Never print passwords into chat or logs.
- **Run:** `bun --no-env-file run dev` with the env file sourced. Log in as a seeded player (or the admin account) and check the change on the affected pages, in the browser, at desktop width.
- **Evidence:** keep before and after screenshots outside the repo, and cite them in the PR.
- **Teardown:** stop the dev server and remove the container (`podman rm -f <name>`).

Local checks prove the change works against a fresh database. They do not replace the alpha test. Alpha and staging are deployed only after this passes.

## Versioning and releases

OpenThrone uses Semantic Versioning on the 0.x line (`CHANGELOG.md` explains the rules). Every production release runs all seven steps in [docs/git-workflow.md](docs/git-workflow.md#releases); the release is not done until the last one passes:

1. Version PR into `alpha`: `version` in `package.json` and `package-lock.json` set to the release (for example `0.5.0`, dropping `-alpha`), and its player-facing `CHANGELOG.md` entry.
2. Release PR from `alpha` into `master` after the release documentation gate (section 16); merge only with the user's go-ahead.
3. Deploy production, as above, and confirm the footer shows the new version.
4. Tag the release merge commit `vX.Y.Z` on Forgejo, through the tags API under the bot's `tea` login (`agent-forgejo` cannot push tags).
5. Mirror to GitHub: one squashed `Release vX.Y.Z` commit on `github/master` whose tree equals Forgejo `master`, the same tag, and a GitHub Release with the changelog entry, marked Latest. A release missed earlier gets its own commit first.
6. PR into `alpha` bumping both package files to the next pre-release (for example `0.6.0-alpha`).
7. Check that Forgejo `master`, Forgejo `alpha` and `github/master` show the expected versions and both remotes have the tag.

The footer shows the version and build commit, so bug reports can name the exact build.

## Credential privacy

- Do not read or print `.env*` contents (including samples), credential stores, tokens, private keys, database dumps, or authentication headers into model-visible output. Inspect variable names in source code instead.
- Never run `env`, `printenv`, shell tracing, config dumps, or commands that interpolate credentials into visible command text. Disable automatic env-file loading for code-only Bun checks with `bun --no-env-file`.
- Use configured tools such as `tea` without opening their credential files. Keep tool output to the minimum needed; do not enable debug logging.
- Use synthetic data and disposable development credentials. Production access belongs in a separately enforced operation service that accepts narrowly allowed actions and returns approved, sanitized results.
- These instructions and `.gitignore` are behavioral safeguards, not access controls. An agent with unrestricted filesystem/process access can still obtain secrets. Do not claim that this workspace enforces credential isolation.


## Publishing to Forgejo

Any commit, push, issue, or comment that reaches the Forgejo remote must go through the installed `agent-forgejo` helper, run from this checkout. It selects the matching bot identity, adds contributor labels and ACP task/job/model/client attribution, and refuses mismatched authentication. Do not use plain `git commit` / `git push`, the human Forgejo login, or a changed global Git identity.

- If `ACP_AGENT` context is present (Agent Control Plane or `agent-run`), call `agent-forgejo` directly.
- Otherwise wrap each publishing operation: `agent-run <family> <actual-model> agent-forgejo <action> ...`. Families: `claude`, `codex`, `glm`, `gemini`, `openrouter`. Pass the real model id; set `ACP_TASK` to the ledger task id when one exists and `ACP_CLIENT` to the actual client (claude, codex, zcode, opencode, agy).
- Actions: `commit --message '...'` (staged files only), `push --remote origin --branch <branch>`, `issue-create`, `issue-comment`.
- Bot pushes work over the SSH `origin` remote (the control plane's own SSH config resolves `git.aioxhost.com` to the Forgejo host). If SSH is unavailable on a machine, an HTTPS remote `https://git.aioxhost.com/dastacomann/OpenThrone.git` works with the bot token instead.
- If the helper refuses, report the blocker; do not fall back. Attribution does not by itself authorize publication.

This applies to subagents, delegated tasks, and sessions on other machines. Full workflow: `/home/tim/Projects/AIOX-CP/docs/agent-identities.md`.
