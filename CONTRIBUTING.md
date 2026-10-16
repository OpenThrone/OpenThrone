# Contributing to OpenThrone

Use the repository's issue tracker to report bugs or discuss enhancements. Include reproduction steps, expected and actual behavior, and relevant logs with secrets removed.

## Development workflow

1. Follow [local setup](README.md#local-development) and [AGENTS.md](AGENTS.md).
2. Create a branch such as `feature/123-description`, `fix/123-description`, or `docs/123-description`; omit the issue number if there is no issue.
3. Keep changes focused and follow the existing code patterns. Use Mantine primitives, race theme tokens, `@/` imports, and translation keys for shared UI text.
4. Run the checks appropriate to your change. For code, use `bun run check-types`, `bun run lint`, and relevant tests. `bun run test` is the default Bun suite; the three Jest DOM suites listed in the [README](README.md#verification) run separately.
5. Open a pull request explaining the problem, resulting behavior, validation, and any limitations. For UI or visual bug fixes, always include before and after screenshots as evidence of resolution. Link the relevant issue.

Add tests when requested or when risk is high and localized. Avoid brittle visual snapshots. `bun run format` rewrites files; inspect its diff before including changes.

## Documentation changes

Start at the [documentation index](docs/README.md). Keep setup commands grounded in `package.json` and configuration, link to source for fast-changing mechanics, and mark dated findings as historical. Check local links and referenced commands; a prose-only change does not require the application test suite.
