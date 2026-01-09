# Cypress E2E

## Quick start

- Install the Cypress binary (kept in a repo-local cache folder):
  - `bun run cypress:install`
- Run the simple smoke test headless against the default environment:
  - `bun run cypress:run`

## Target URL

Tests use `APP_URL` as the base URL.

- Default: `http://localhost:3001`
- Override:
  - `CYPRESS_APP_URL=http://localhost:3001 bun run cypress:run`
  - `CYPRESS_APP_URL=https://alpha.openthrone.dev bun run cypress:run`

## Opening the UI

- `bun run cypress:open`
- If you are in a headless Linux environment:
  - `bun run cypress:open-xvfb`

## Common failures

### "Can't run because no spec files were found"

Cypress defaults to `*.cy.{js,jsx,ts,tsx}` for E2E spec discovery.

- Specs live in `cypress/e2e/` and should typically be named `*.cy.ts`.
- The project config also allows `*.spec.*` via `e2e.specPattern`.

### `FATAL:sandbox_host_linux.cc(41) ... Operation not permitted`

This usually means the environment is blocking Chromium/Electron sandboxing (common in containers/CI).

Recommended fixes:

- Run Cypress in an environment that supports launching a browser sandbox (local machine or a CI image intended for browsers).
- Prefer a non-snap Chrome/Chromium install on Linux (snap Chromium often fails in CI/containers).
- In CI, consider using Cypress' official Docker images (for example `cypress/included`) and run the tests inside that container.

