# Internal review and public release workflow

Proposed workflow for OpenThrone, operated by AIOXperts IT Solutions LLC. Recorded 2026-10-06; repository settings and release automation have not been changed by this document.

## Repository roles

- `origin`: internal Forgejo, `git@git.aioxhost.com:dastacomann/OpenThrone.git`.
- `github`: public upstream, `git@github.com:OpenThrone/OpenThrone.git`.
- Internal Forgejo issues and pull requests hold work in progress and operational context. Public GitHub issues/PRs should describe public product behavior without private infrastructure details or player data.
- Keep contributions attributed to their authors. Operating through the LLC does not by itself change ownership, the existing license, contributor rights or third-party asset permissions.

## Everyday work

1. Branch from the intended internal base using `fix/<issue>-<subject>` or `feature/<issue>-<subject>`; inspect a dirty working tree first.
2. Commit focused changes and push the branch explicitly to `origin`. Open an internal PR that links the issue, states before/after behavior and records checks and unresolved limits. For visual or UI fixes, include before and after screenshots as evidence.
3. Review code, security, race themes, mobile/keyboard states and data migration implications on internal staging with synthetic data.
4. Keep merge/release decisions explicit. Protect internal main against direct/force pushes and require review plus checks when Forgejo runner infrastructure is ready.
5. Maintain separate commit groups for login/reward fixes, UI changes and documentation. Squash/reword private WIP on an unpublished release branch after review; preserve original authorship and necessary issue references. Do not rewrite shared main to clean commits.

## Promote to GitHub

1. Fetch `origin` and `github`. Create a promotion branch from the current public base in a separate worktree, then cherry-pick reviewed commits (or assemble one coherent squash per reviewed change).
2. Review the entire public diff and every reachable commit on the promotion branch: secrets, private hosts, player records, logs, screenshots, generated artifacts, license/asset provenance and authorship.
3. Run the agreed Bun checks and staging acceptance checks. Secret scanning must cover history as well as the working tree and return locations/rule IDs without secret values.
4. Push the promotion branch explicitly to `github` and open a public PR. Merge through the public review process. Avoid automatic mirroring of internal branches, issues, releases or artifacts.
5. Record the public commit/tag in the internal release record and reconcile the branch bases before the next promotion.

Commit cleanup and secret removal are separate jobs: removing a secret from a commit does not revoke it. Rotate exposed credentials first; coordinate any public history rewrite with contributors and downstream users.

## Public repository cleanup backlog

- Inventory existing public branches/tags/releases, documentation and assets before selecting anything for cleanup.
- Scan public reachable history and artifacts with redacted findings, revoke exposed secrets, then decide whether coordinated history rewriting is necessary.
- Verify README setup with synthetic configuration, operator attribution, contribution guidelines, security-reporting contact, code of conduct and existing license/third-party provenance. Preserve existing author credit.
- Modernize `.github/workflows/CI.yml`: it currently uses Node 16/18, `npm ci`, obsolete export/build commands and a missing Storybook test script. Use the repository's Bun tooling and supported runtime; remove secret-bearing production dependencies from contributor checks.
- Review automated dependency/release workflows before enabling promotion. Keep internal Forgejo automation and public GitHub automation independent.
- Exclude private screenshots, real player exports, debug logs and operational credential files from public releases.

No GitHub cleanup, history rewrite, repository policy change, push, merge or deployment has been performed in this task.
