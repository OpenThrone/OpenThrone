---
name: openthrone-ship
description: Fix, test, commit, push and deploy an OpenThrone (next-DC) change across local, alpha.openthrone.dev and production. Use when asked to ship, deploy, test on alpha, reproduce a production bug report, or correct production data for this project.
---

# Ship an OpenThrone change

Read `docs/environments-and-deploy.md` first. It holds the environments, the exact alpha and production steps, rollback, and the production data rules. Addresses and credentials are in the private inventory (`/home/tim/Projects/agentic`); never copy them into the repo or chat.

1. **Reproduce.** Bug reports usually come from production. Reproduce against production-shaped data (read-only), not just staging.
2. **Fix and test locally.** Run `bun run dev` (also served at `https://ot.aioxhost.com`), then lint, targeted `bun test`, and `bun run check-types`. Check UI headlessly.
3. **Commit and push** only through `agent-forgejo` (see `AGENTS.md`). Stage only your own files.
4. **Alpha.** Fast-forward the dev VM, install, check and apply migrations, restart PM2, and verify.
5. **Production.** Only when the user asks. Follow the documented build-in-place steps, keep a rollback copy, and verify the revision and a 200.
6. **Production data.** Audit for other affected accounts and report before writing. Writes need explicit authorization, one guarded transaction, and a read-back.
7. **Report** what was verified and what was not. Delete temporary scripts.
