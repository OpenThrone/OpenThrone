# Environments, testing and deployment

How a change moves from this checkout to players. Addresses, credentials and SSH access live in the private homelab inventory (`/home/tim/Projects/agentic`), not here. Never paste secrets or `.env` contents into chat, commits or logs.

## Environments

| Environment | Where | Notes |
| --- | --- | --- |
| Local | This checkout, `bun run dev` on port 3000, also reachable at `https://ot.aioxhost.com` | Its `.env` points at the same staging database as alpha, so local writes change alpha data. See "Running locally" below. |
| Alpha | `https://alpha.openthrone.dev`, dev VM `BDAO`, `/home/tim/projects/next-DC`, PM2 `OTDev` | Runs `next dev`, so pages compile on first hit and a request right after a restart can return 500 while it compiles. PM2 lives under `~/.nvm/versions/node/v16.13.1/bin` and is not on a non-interactive SSH `PATH`. |
| Production | `https://openthrone.dev`, LXC `CT102`, `/root/OpenThrone`, PM2 `OTProd` on `:3001` | Production build (`bun run build`). Hosted Postgres, separate from staging. |

Players report bugs from production, so production data is the source of truth for reproducing them. Alpha data is not production-shaped (for example a player with zero citizens after an era reset), so reproduce edge states explicitly before calling a fix tested.

## OT Time

The game clock is `OT_TIME_ZONE` (`America/New_York`) in `src/utils/timefunctions.ts`, independent of the host's timezone. Every daily rule keys on the OT calendar day via `getOTStartDate` / `getOTDayKey`: combat casualty and gold caps, defense and spy pressure, recruiting, admin analytics, and the era-reset form. The sidebar clock renders in that zone for every viewer. The production and alpha crontabs run on hosts set to US/Eastern, so the daily job fires at OT midnight; keep it that way if a host is rebuilt.

## Running locally

`https://ot.aioxhost.com` is a reverse-proxy entry (npmplus on the Docker host, LAN and Tailnet only) that forwards to this workstation on port 3000. It returns 502 whenever the dev server is down, so a 502 means "start it", not "broken".

```bash
cd /home/tim/Projects/next-DC
bun run dev > /tmp/ot-local-dev.log 2>&1 &     # custom server in src/server/index.ts, Next dev plus Socket.IO
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/        # first hit compiles; allow up to a minute
curl -sk -o /dev/null -w '%{http_code}\n' https://ot.aioxhost.com/     # same server through the proxy
```

- The server listens on all interfaces. Its "Server ready on https://<hostname>" log line shows the machine hostname and is not the real URL.
- `next.config.js` lists `ot.aioxhost.com` in `allowedDevOrigins`, so hot reload works through the proxy. Add any new dev hostname there.
- It uses the staging database, so test accounts and data are shared with alpha. Never point it at production.
- Stop it by killing the PID from `ss -ltnp | grep :3000`. Do not use `pkill -f` with a pattern that also matches your own shell command.
- Use this URL (or `localhost:3000`) for headless UI checks before pushing; it is the fastest loop and needs no deploy.

## Workflow

1. **Fix locally.** Follow `AGENTS.md`. Run `bun run lint`, the relevant `bun test <path>`, and `bun run check-types`. `check-types` currently reports one error in `src/pages/home/admin/inactive-users.tsx`; ignore it unless you touched that file.
2. **Commit and push** through `agent-forgejo` only (see `AGENTS.md`, "Publishing to Forgejo"). Stage only your own files. Do not publish without the user's go-ahead.
3. **Alpha test.** On the dev VM: `git fetch forgejo <branch> && git merge --ff-only FETCH_HEAD`, then `bun install` (without `--frozen-lockfile` if the lockfile moved, and `git checkout -- bun.lockb` afterwards), apply migrations, `pm2 restart OTDev`. Public pages can be checked headless; pages behind login need a logged-in browser session.
4. **Production deploy.** Only after alpha passes, and only when the user asks.
5. **Report** what was verified and what was not.

### Migrations

Check `bun --bun x prisma migrate status` against the target database before restarting. Apply with `bun --bun x prisma migrate deploy` and `bun --bun x prisma generate` (use `bun --bun x`; the VM's Node 16 cannot run Prisma 7). Migrations are additive; confirm that before applying to production.

### Production deploy steps

```bash
cd /root/OpenThrone
git fetch forgejo <branch> && git merge --ff-only FETCH_HEAD
bun install --frozen-lockfile
bun --bun x prisma migrate status        # apply with `migrate deploy` if pending
mv .next .next.prev-<old-sha>            # rollback copy
bun run build > /root/final-build-<sha>.log 2>&1   # check for BUILD_EXIT=0 / no errors
pm2 restart OTProd --update-env
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/
```

Then confirm `pm2` reports the new revision and `https://openthrone.dev/` returns 200. Delete `.next.prev-*` only when the user is happy; the disk is tight (about 88% full).

Rebuild in place. Do not copy a `.next` built in another directory: the build embeds its own absolute path. Do not use git worktrees for builds on the server.

If the build fails: `rm -rf .next && mv .next.prev-<old-sha> .next && pm2 restart OTProd`.

## Production data access

- Start read-only. Run one-off scripts from `/tmp` that import `/root/OpenThrone/src/lib/prisma` with `/root/OpenThrone` as the working directory, so the app's own environment loads without printing it. Delete the script afterwards.
- Writing to production data needs explicit authorization from the user in the session. Make the write a single transaction with guards that abort on unexpected state, and read the result back.
- Bug reports about lost or wrong data: find the affected rows in `bank_history` / `attack_log` / `AuditLog`, audit for other affected accounts, and report both before changing anything. `bank_history.stats->>'type'` identifies training events (`TRAINING_TRAIN`, `TRAINING_UNTRAIN`).
- Staging and production are separate databases. Confirm which one a query ran against before drawing conclusions from it.

## Checking UI

- Headless screenshots: Playwright from `/home/tim/Projects/ot-ux-lab/node_modules/playwright` or `chromium-browser --headless --screenshot`. Use Playwright's element screenshots for cards below the fold; the page scrolls inside a container, so full-page captures are cut short.
- The profile page renders a skeleton on the server and fills in on the client, so check rendered DOM rather than raw HTML.
- Test with at least one race theme besides the default, and with logged-out and logged-in views.
