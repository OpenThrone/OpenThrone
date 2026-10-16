# Cypress E2E

```bash
bun run cypress:install
bun run cypress:open
```

The config resolves its target from `CYPRESS_APP_URL`, then `APP_URL`, then `http://localhost:3001`. The development server defaults to **3000**, so set the target explicitly for local tests.

The `cypress:run` and `cypress:run-xvfb` scripts hard-code the alpha target in their command. A shell prefix cannot override that assignment. Use the direct command for a custom target:

```bash
CYPRESS_CACHE_FOLDER=.cypress-cache CYPRESS_APP_URL=http://localhost:3000 bunx cypress run --headless
```

`bun run cypress:run` runs against `https://alpha.openthrone.dev`. Inspect the chosen specs and credentials before running against a shared environment.

Specs live in `cypress/e2e/`; [cypress.config.js](../cypress.config.js) discovers both `*.cy.*` and `*.spec.*` files. Binary cache: `.cypress-cache/`.

For headless Linux, `bun run cypress:open-xvfb` opens the UI through Xvfb. For a custom headless target:

```bash
CYPRESS_CACHE_FOLDER=.cypress-cache CYPRESS_APP_URL=http://localhost:3000 xvfb-run -s "-screen 0 1920x1080x24" bunx cypress run --headless
```

If no specs are found, check the configured spec pattern. For browser launch failures, use a browser-capable environment; the current config already adds `--no-sandbox` and shared-memory flags for Chromium/Electron.
