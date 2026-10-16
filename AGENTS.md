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
- Jest-native DOM suites: `bun run test:jest -- <path/to/test-file>` — only
  `src/lib/socket.test.ts`, `src/components/sidebar/SidebarShared.test.tsx`,
  and `src/__tests__/app-shell.test.tsx` need jsdom; `test:bun` excludes them
  because they use `jest.*` globals and cannot run without a DOM.

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

## 10) Testing

- Add tests only when requested or when risk is high and localized.
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

## 12) “Done” Checklist

A change is complete only if:

- [ ] Mantine primitives used where available
- [ ] Existing repo patterns reused
- [ ] No unnecessary global CSS added
- [ ] Keyboard and focus behavior verified
- [ ] Performance impact considered
- [ ] Imports sorted and aliases used
- [ ] Works across race themes
- [ ] Visual evidence provided (before and after screenshots) for any UI/styling bug resolutions


## Environments and deployment

Branch model: `master` is production (`openthrone.dev`) and `alpha` is the alpha server (`alpha.openthrone.dev`). Agents work on a feature branch cut from `alpha`, test locally, open a PR into `alpha`, test on the alpha server, then open a release PR from `alpha` into `master`. Never commit directly to `alpha` or `master`. Do not deploy to production without the user's explicit go-ahead. Server hostnames, deploy steps, rollback and production data rules are kept outside this repository; ask the user for them before touching alpha or production.

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
